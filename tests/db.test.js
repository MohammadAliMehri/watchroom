import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createSqliteDriver } from "../db/sqlite.js";
import { runMigrations } from "../db/index.js";
import { createRepo } from "../db/repo.js";

test("Database migrations and repository test", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "watchroom-test-"));
  const testDbPath = path.join(tmpDir, "test.db");
  const driver = createSqliteDriver(testDbPath);

  await t.test("Migrations run on an empty SQLite database", async () => {
    await runMigrations(driver);

    // Verify schema_migrations table
    const migrations = await driver.all(
      "SELECT name FROM schema_migrations ORDER BY name ASC",
    );
    assert.equal(migrations.length, 3);
    assert.equal(migrations[0].name, "001_init.sql");
    assert.equal(migrations[1].name, "002_indexes.sql");
    assert.equal(migrations[2].name, "003_host_controls.sql");

    // Verify tables exist
    const tables = await driver.all(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    );
    const tableNames = tables.map((r) => r.name);
    assert.ok(tableNames.includes("users"));
    assert.ok(tableNames.includes("sessions"));
    assert.ok(tableNames.includes("rooms"));
    assert.ok(tableNames.includes("playlist_items"));
    assert.ok(tableNames.includes("room_members"));
    assert.ok(tableNames.includes("messages"));
    assert.ok(tableNames.includes("schema_migrations"));

    // Verify indexes exist
    const indexes = await driver.all(
      `SELECT name FROM sqlite_master WHERE type='index'`,
    );
    const indexNames = indexes.map((r) => r.name);
    assert.ok(indexNames.includes("idx_sessions_user"));
    assert.ok(indexNames.includes("idx_sessions_expires"));
    assert.ok(indexNames.includes("idx_rooms_owner"));
    assert.ok(indexNames.includes("idx_items_room_pos"));
    assert.ok(indexNames.includes("idx_messages_room_time"));
  });

  await t.test(
    "Migrations are idempotent (rerunning changes nothing)",
    async () => {
      await runMigrations(driver);
      const migrations = await driver.all("SELECT name FROM schema_migrations");
      assert.equal(migrations.length, 3);
    },
  );

  await t.test(
    "Legacy host-only rooms keep their setting during migration",
    async () => {
      const legacy = createSqliteDriver(path.join(tmpDir, "legacy.db"));
      try {
        await legacy.exec(`CREATE TABLE rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, host_only INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
        INSERT INTO rooms VALUES ('old-room', 'Our night', 'secret', 1, 123);`);
        await runMigrations(legacy);
        await runMigrations(legacy);
        const room = await legacy.get(
          "SELECT host_only FROM rooms WHERE id = 'old-room'",
        );
        assert.equal(room.host_only, 1);
        assert.equal(
          (await legacy.all("SELECT name FROM schema_migrations")).length,
          3,
        );
      } finally {
        await legacy.close();
      }
    },
  );

  await t.test("Repository operations work properly", async () => {
    const repo = createRepo(driver);

    // User tests
    const user = await repo.createUser({
      id: "user-1",
      email: "Test@Example.com",
      displayName: "TestUser",
      passwordHash: "hashed_pw",
    });
    assert.equal(user.email, "test@example.com");
    assert.equal(user.displayName, "TestUser");

    const byEmail = await repo.getUserByEmail("test@EXAMPLE.COM");
    assert.equal(byEmail.id, "user-1");

    // Session tests
    await repo.createSession({
      tokenHash: "token-hash-1",
      userId: "user-1",
      expiresAt: Date.now() + 100000,
    });

    const sessionRes = await repo.getSessionUser("token-hash-1");
    assert.ok(sessionRes);
    assert.equal(sessionRes.user.id, "user-1");

    // Room and Playlist tests
    const room = await repo.createRoom({
      id: "room-1",
      ownerId: "user-1",
      name: "My Room",
      passwordHash: "room_pw_hash",
    });
    assert.equal(room.name, "My Room");

    const isMem = await repo.isMember("room-1", "user-1");
    assert.equal(isMem, true);

    await repo.addItem({
      id: "item-1",
      roomId: "room-1",
      position: 0,
      url: "https://example.com/v.mp4",
      title: "Video 1",
      format: "direct",
      durationSec: 120,
      addedBy: "user-1",
    });

    const items = await repo.listItems("room-1");
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Video 1");

    // Messages pruning test: add 205 messages and ensure only last 200 kept
    for (let i = 0; i < 205; i++) {
      await repo.addMessage({
        id: `msg-${i}`,
        roomId: "room-1",
        userId: "user-1",
        nick: "TestUser",
        text: `Message ${i}`,
      });
    }

    const messages = await repo.listMessages("room-1", 300);
    assert.equal(messages.length, 200);
    assert.equal(messages[messages.length - 1].text, "Message 204");
  });

  await driver.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup error on windows
  }
});
