import test from "node:test";
import dns from "node:dns/promises";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import { Server } from "socket.io";
import { io as ioc } from "socket.io-client";
import { createSqliteDriver } from "../db/sqlite.js";
import { runMigrations } from "../db/index.js";
import { createRepo } from "../db/repo.js";
import {
  attachUser,
  hashPassword,
  generateSessionToken,
  hashToken,
  COOKIE_NAME,
} from "../lib/auth.js";
import roomsRoutes from "../routes/rooms.js";
import { RoomManager } from "../src/roomManager.js";
import { registerRoomEvents } from "../src/socketEvents.js";

test("Rooms and Chat persistence and socket behaviors", async (t) => {
  const realLookup = dns.lookup.bind(dns);
  t.mock.method(dns, "lookup", (hostname, ...args) =>
    hostname === "example.com"
      ? Promise.resolve([{ address: "93.184.215.14", family: 4 }])
      : realLookup(hostname, ...args),
  );
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "watchroom-rooms-test-"),
  );
  const testDbPath = path.join(tmpDir, "test.db");
  process.env.DB_PATH = testDbPath;

  const driver = createSqliteDriver(testDbPath);
  await runMigrations(driver);
  const repo = createRepo(driver);

  // Create two test users: Owner and Member
  const ownerPw = await hashPassword("Password123");
  const owner = await repo.createUser({
    id: "user-owner-1",
    email: "owner@example.com",
    displayName: "OwnerBob",
    passwordHash: ownerPw,
  });

  const memberPw = await hashPassword("Password123");
  const member = await repo.createUser({
    id: "user-member-1",
    email: "member@example.com",
    displayName: "MemberCharlie",
    passwordHash: memberPw,
  });

  // Create session tokens
  const ownerToken = generateSessionToken();
  await repo.createSession({
    tokenHash: hashToken(ownerToken),
    userId: owner.id,
    expiresAt: Date.now() + 1000000,
  });

  const memberToken = generateSessionToken();
  await repo.createSession({
    tokenHash: hashToken(memberToken),
    userId: member.id,
    expiresAt: Date.now() + 1000000,
  });

  // Setup express server with socket.io
  const app = express();
  app.use(express.json());
  app.use(attachUser);
  app.use("/api/rooms", roomsRoutes);

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });
  const roomManager = new RoomManager(io);
  app.set("roomManager", roomManager);

  // Socket middleware for auth
  io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
      if (match) {
        const token = match[1];
        const res = await repo.getSessionUser(hashToken(token));
        if (res) {
          socket.data.user = res.user;
        }
      }
    }
    next();
  });

  registerRoomEvents(io, roomManager);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  function connectSocket(cookie = "") {
    return ioc(`http://127.0.0.1:${port}`, {
      extraHeaders: cookie ? { Cookie: cookie } : {},
      transports: ["websocket"],
      forceNew: true,
    });
  }

  let createdRoomId = null;

  await t.test(
    "Host-only controls persist and reject guest playback changes",
    async () => {
      const created = await roomManager.createRoom(
        { name: "Date night", password: "secret", hostOnly: true },
        owner,
      );
      const room = roomManager.rooms.get(created.roomId);
      assert.equal(room.hostOnly, true);
      assert.equal((await repo.getRoom(created.roomId)).hostOnly, 1);
      await repo.addMember(created.roomId, member.id);
      const notices = [];
      const guest = {
        data: { user: member, roomId: room.id },
        emit: (event, data) => notices.push({ event, data }),
      };
      await roomManager.handleControl(guest, {
        action: "play",
        currentTime: 12,
      });
      assert.equal(room.playback.isPlaying, false);
      assert.match(notices[0].data.message, /Only the host/);
      const host = { data: { user: owner, roomId: room.id }, emit() {} };
      await roomManager.handleControl(host, {
        action: "play",
        currentTime: 12,
      });
      assert.equal(room.playback.isPlaying, true);
      const restored = new RoomManager(io);
      await restored.initPromise;
      assert.equal(restored.rooms.get(room.id).hostOnly, true);
      await roomManager.removeRoom(room.id);
      await repo.deleteRoom(room.id);
    },
  );

  await t.test("Unauthenticated room:create is rejected", async () => {
    const unauthSocket = connectSocket();
    await new Promise((r) => unauthSocket.on("connect", r));

    const res = await new Promise((resolve) => {
      unauthSocket.emit(
        "room:create",
        { name: "Test Room", password: "secretpassword" },
        resolve,
      );
    });

    assert.equal(res.ok, false);
    assert.equal(res.error, "Sign in required");
    unauthSocket.disconnect();
  });

  await t.test("Owner can create room and join without password", async () => {
    const ownerSocket = connectSocket(`${COOKIE_NAME}=${ownerToken}`);
    await new Promise((r) => ownerSocket.on("connect", r));

    const createRes = await new Promise((resolve) => {
      ownerSocket.emit(
        "room:create",
        { name: "Movie Night", password: "RoomPassword123" },
        resolve,
      );
    });

    assert.equal(createRes.ok, true);
    assert.ok(createRes.roomId);
    assert.equal(createRes.roomId.length, 8); // 8 hex characters
    createdRoomId = createRes.roomId;

    // Join room without providing password
    const joinRes = await new Promise((resolve) => {
      ownerSocket.emit("room:join", { roomId: createdRoomId }, resolve);
    });

    assert.equal(joinRes.ok, true);
    assert.equal(joinRes.isOwner, true);
    ownerSocket.disconnect();
  });

  await t.test(
    "Room lists reveal metadata only to owners and existing members",
    async () => {
      for (const [token, shouldSeeRoom] of [
        [ownerToken, true],
        [memberToken, false],
        ["", false],
      ]) {
        const client = connectSocket(token ? `${COOKIE_NAME}=${token}` : "");
        try {
          await new Promise((resolve) => client.on("connect", resolve));
          const listing = new Promise((resolve) =>
            client.once("rooms:list", resolve),
          );
          client.emit("rooms:list", {});
          const data = await listing;
          assert.equal(
            data.rooms.some((room) => room.id === createdRoomId),
            shouldSeeRoom,
          );
        } finally {
          client.disconnect();
        }
      }
    },
  );

  await t.test(
    "Unjoined requests acknowledge failure and malformed chat cannot break the connection",
    async () => {
      const client = connectSocket(`${COOKIE_NAME}=${ownerToken}`);
      try {
        await new Promise((resolve) => client.on("connect", resolve));
        for (const event of ["playlist:add", "media:prepare"]) {
          const result = await new Promise((resolve, reject) =>
            client
              .timeout(1000)
              .emit(event, {}, (error, ack) =>
                error ? reject(error) : resolve(ack),
              ),
          );
          assert.equal(result.success, false);
          assert.match(result.error, /Must join/);
        }
        const malformed = await new Promise((resolve) =>
          client.emit("room:create", "invalid", resolve),
        );
        assert.equal(malformed.success, false);
        await new Promise((resolve) =>
          client.emit("room:join", { roomId: createdRoomId }, resolve),
        );
        const badChat = await new Promise((resolve) =>
          client.emit("chat:send", { text: { invalid: true } }, resolve),
        );
        assert.equal(badChat.success, false);
        assert.equal(badChat.error, "Chat text must be a string");
        const validChat = await new Promise((resolve) =>
          client.emit("chat:send", { text: "Still connected" }, resolve),
        );
        assert.equal(validChat.success, true);
      } finally {
        client.disconnect();
      }
    },
  );

  await t.test(
    "Non-owner: wrong password is rejected, correct password succeeds",
    async () => {
      const memberSocket = connectSocket(`${COOKIE_NAME}=${memberToken}`);
      await new Promise((r) => memberSocket.on("connect", r));

      // Try with wrong password
      const failRes = await new Promise((resolve) => {
        memberSocket.emit(
          "room:join",
          { roomId: createdRoomId, password: "WrongPassword" },
          resolve,
        );
      });
      assert.equal(failRes.ok, false);
      assert.match(failRes.error, /Wrong password/);

      // Try with correct password
      const passRes = await new Promise((resolve) => {
        memberSocket.emit(
          "room:join",
          { roomId: createdRoomId, password: "RoomPassword123" },
          resolve,
        );
      });
      assert.equal(passRes.ok, true);
      assert.equal(passRes.isOwner, false);

      memberSocket.disconnect();
    },
  );

  await t.test(
    "Non-member cannot add playlist items, member can add items",
    async () => {
      const nonMember = connectSocket(`${COOKIE_NAME}=${memberToken}`);
      await new Promise((r) => nonMember.on("connect", r));

      // Do not join room first, attempt to add item
      nonMember.data = {};
      const failAdd = await new Promise((resolve) => {
        nonMember.emit(
          "playlist:add",
          { url: "https://example.com/video.mp4", title: "Video" },
          resolve,
        );
      });
      assert.equal(failAdd?.success, false);

      // Join room
      await new Promise((resolve) => {
        nonMember.emit(
          "room:join",
          { roomId: createdRoomId, password: "RoomPassword123" },
          resolve,
        );
      });

      // Now add item
      const okAdd = await new Promise((resolve) => {
        nonMember.emit(
          "playlist:add",
          { url: "https://example.com/video.mp4", title: "Video" },
          resolve,
        );
      });
      assert.equal(okAdd.success, true);

      const items = await repo.listItems(createdRoomId);
      assert.equal(items.length, 1);
      assert.equal(items[0].addedBy, member.id);

      nonMember.disconnect();
    },
  );

  await t.test(
    "Member can batch add multiple URLs (e.g. for TV shows)",
    async () => {
      const memberSocket = connectSocket(`${COOKIE_NAME}=${memberToken}`);
      await new Promise((r) => memberSocket.on("connect", r));
      await new Promise((resolve) => {
        memberSocket.emit(
          "room:join",
          { roomId: createdRoomId, password: "RoomPassword123" },
          resolve,
        );
      });

      const batchRes = await new Promise((resolve) => {
        memberSocket.emit(
          "playlist:addBatch",
          {
            items: [
              {
                url: "https://example.com/show/s01e01.mkv",
                title: "S01E01 - Pilot",
              },
              {
                url: "https://example.com/show/s01e02.mkv",
                title: "S01E02 - Episode 2",
              },
              {
                url: "https://example.com/show/s01e03.mkv",
                title: "S01E03 - Episode 3",
              },
            ],
          },
          resolve,
        );
      });

      assert.equal(batchRes.success, true);
      assert.equal(batchRes.count, 3);

      const items = await repo.listItems(createdRoomId);
      assert.equal(items.length, 4);
      assert.equal(items[1].title, "S01E01 - Pilot");
      assert.equal(items[2].title, "S01E02 - Episode 2");
      assert.equal(items[3].title, "S01E03 - Episode 3");

      memberSocket.disconnect();
    },
  );

  await t.test(
    "Messages persist and only last 200 messages are kept",
    async () => {
      const memberSocket = connectSocket(`${COOKIE_NAME}=${memberToken}`);
      await new Promise((r) => memberSocket.on("connect", r));
      await new Promise((resolve) => {
        memberSocket.emit(
          "room:join",
          { roomId: createdRoomId, password: "RoomPassword123" },
          resolve,
        );
      });

      // Insert 205 messages via repo to test boundary
      for (let i = 0; i < 205; i++) {
        await repo.addMessage({
          id: `m_${i}`,
          roomId: createdRoomId,
          userId: member.id,
          nick: "MemberCharlie",
          text: `Chat message ${i}`,
        });
      }

      const messages = await repo.listMessages(createdRoomId, 300);
      assert.equal(messages.length, 200);
      assert.equal(messages[messages.length - 1].text, "Chat message 204");

      memberSocket.disconnect();
    },
  );

  await t.test(
    "Simulate restart: rooms reload from database with saved state",
    async () => {
      const newRoomManager = new RoomManager(io);
      await newRoomManager.initPromise;

      const restored = newRoomManager.rooms.get(createdRoomId);
      assert.ok(restored);
      assert.equal(restored.name, "Movie Night");
      assert.equal(restored.ownerId, owner.id);
    },
  );

  await t.test(
    "REST: Owner can rename and delete room, non-owner is forbidden",
    async () => {
      function req(method, path, body, cookie) {
        return new Promise((resolve, reject) => {
          const payload = body ? JSON.stringify(body) : "";
          const r = http.request(
            `http://127.0.0.1:${port}${path}`,
            {
              method,
              headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
                Cookie: cookie ? `${COOKIE_NAME}=${cookie}` : "",
              },
            },
            (res) => {
              let chunks = [];
              res.on("data", (c) => chunks.push(c));
              res.on("end", () => {
                const raw = Buffer.concat(chunks).toString();
                let parsed = null;
                try {
                  parsed = JSON.parse(raw);
                } catch (e) {
                  parsed = raw;
                }
                resolve({ status: res.statusCode, data: parsed });
              });
            },
          );
          r.on("error", reject);
          if (payload) r.write(payload);
          r.end();
        });
      }

      // Member tries to rename -> 403
      const memRename = await req(
        "PATCH",
        `/api/rooms/${createdRoomId}`,
        { name: "Hacked Name" },
        memberToken,
      );
      assert.equal(memRename.status, 403);

      // Owner renames -> 200
      const ownerRename = await req(
        "PATCH",
        `/api/rooms/${createdRoomId}`,
        { name: "Renamed Night" },
        ownerToken,
      );
      assert.equal(ownerRename.status, 200);
      assert.equal(ownerRename.data.room.name, "Renamed Night");

      // Member tries to delete -> 403
      const memDelete = await req(
        "DELETE",
        `/api/rooms/${createdRoomId}`,
        null,
        memberToken,
      );
      assert.equal(memDelete.status, 403);

      // Owner deletes -> 204
      const ownerDelete = await req(
        "DELETE",
        `/api/rooms/${createdRoomId}`,
        null,
        ownerToken,
      );
      assert.equal(ownerDelete.status, 204);

      // Check room deleted from database
      const roomInDb = await repo.getRoom(createdRoomId);
      assert.equal(roomInDb, null);
      assert.equal(roomManager.rooms.has(createdRoomId), false);
    },
  );

  await t.test("Deleting a room evicts members and notifies them", async () => {
    const ownerSocket = connectSocket(`${COOKIE_NAME}=${ownerToken}`);
    await new Promise((r) => ownerSocket.on("connect", r));
    const created = await new Promise((resolve) => {
      ownerSocket.emit("room:create", { name: "Doomed Room" }, resolve);
    });
    await new Promise((resolve) =>
      ownerSocket.emit("room:join", { roomId: created.roomId }, resolve),
    );

    const closed = new Promise((resolve) =>
      ownerSocket.once("room:closed", resolve),
    );
    const res = await fetch(
      `http://127.0.0.1:${port}/api/rooms/${created.roomId}`,
      {
        method: "DELETE",
        headers: { Cookie: `${COOKIE_NAME}=${ownerToken}` },
      },
    );
    assert.equal(res.status, 204);
    assert.deepEqual(await closed, { roomId: created.roomId });
    assert.equal(roomManager.rooms.has(created.roomId), false);
    ownerSocket.disconnect();
  });

  await t.test(
    "removeRoomsOwnedBy drops a deleted account's rooms from memory",
    async () => {
      const ownerSocket = connectSocket(`${COOKIE_NAME}=${ownerToken}`);
      await new Promise((r) => ownerSocket.on("connect", r));
      const a = await new Promise((resolve) =>
        ownerSocket.emit("room:create", { name: "Ghost A" }, resolve),
      );
      const b = await new Promise((resolve) =>
        ownerSocket.emit("room:create", { name: "Ghost B" }, resolve),
      );
      assert.ok(
        roomManager.rooms.has(a.roomId) && roomManager.rooms.has(b.roomId),
      );

      await roomManager.removeRoomsOwnedBy(owner.id);
      assert.equal(roomManager.rooms.has(a.roomId), false);
      assert.equal(roomManager.rooms.has(b.roomId), false);
      ownerSocket.disconnect();
    },
  );

  server.close();
  await driver.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (e) {}
});
