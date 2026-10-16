import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dns from "node:dns/promises";
import { setImmediate as nextTurn } from "node:timers/promises";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "watchroom-playback-"));
process.env.DB_PATH = path.join(tmpDir, "watchroom.db");
process.env.MEDIA_DIR = path.join(tmpDir, "media");
const { initDb } = await import("../db/index.js");
const { getRepo } = await import("../db/repo.js");
const { RoomManager } = await import("../src/roomManager.js");
const { getJobKey } = await import("../src/converter.js");
const db = await initDb();
const repo = await getRepo();
const owner = await repo.createUser({
  id: "host",
  email: "host@example.test",
  displayName: "Host",
  passwordHash: "unused-test-hash",
});
const guest = await repo.createUser({
  id: "guest",
  email: "guest@example.test",
  displayName: "Guest",
  passwordHash: "unused-test-hash",
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function source(url) {
  const key = getJobKey(url);
  return {
    type: "hls",
    key,
    src: `/media/${key}/index.m3u8`,
    subtitles: null,
    subtitleTracks: [],
    audioStreams: [],
  };
}
function fakeIo() {
  const events = [];
  return {
    events,
    emit(event, data) {
      events.push({ event, data });
    },
    to(roomId) {
      return {
        emit(event, data) {
          events.push({ roomId, event, data });
        },
      };
    },
    in() {
      return {
        async fetchSockets() {
          return [];
        },
      };
    },
  };
}
function socketFor(user, roomId) {
  return {
    id: `${user.id}-${roomId}`,
    data: { user, roomId, userId: user.id },
    events: [],
    emit(event, data) {
      this.events.push({ event, data });
    },
    join() {},
    leave() {},
  };
}
async function fixture(options = {}) {
  const io = fakeIo();
  const manager = new RoomManager(io, options);
  await manager.initPromise;
  const created = await manager.createRoom(
    { name: "Friday night", password: "popcorn" },
    owner,
  );
  const room = manager.rooms.get(created.roomId);
  const host = socketFor(owner, room.id);
  await repo.addMember(room.id, guest.id);
  return { io, manager, room, host };
}
async function addItem(room, label) {
  const items = await repo.listItems(room.id);
  return repo.addItem({
    id: `${room.id}-${label}`,
    roomId: room.id,
    position: items.length,
    url: `https://example.com/${label}.mp4`,
    title: label,
    format: "direct",
    durationSec: 0,
    addedBy: owner.id,
  });
}

test("Room playback consistency", async (t) => {
  t.mock.method(dns, "lookup", async () => [
    { address: "93.184.215.14", family: 4 },
  ]);
  t.after(async () => {
    await db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await t.test(
    "Sync snapshots pair the effective position with the snapshot timestamp",
    async (t) => {
      const { manager, room, io, host } = await fixture();
      t.mock.method(Date, "now", () => 14000);
      Object.assign(room.playback, {
        currentTime: 10,
        isPlaying: true,
        updatedAt: 10000,
      });
      const ack = await manager.joinRoom(host, { roomId: room.id });
      assert.equal(ack.playback.currentTime, 14);
      assert.equal(ack.playback.updatedAt, 14000);
      manager.broadcastSyncState(room.id);
      const state = io.events
        .filter((e) => e.event === "sync:state")
        .at(-1).data;
      assert.equal(state.currentTime + (15000 - state.updatedAt) / 1000, 15);
    },
  );

  await t.test(
    "A slower old conversion cannot replace a newer selection or emit stale progress",
    async () => {
      const first = deferred(),
        second = deferred();
      const progress = new Map();
      const { manager, room, io } = await fixture({
        mediaPreparer: (url, _audio, onProgress) => {
          progress.set(url, onProgress);
          return url.includes("first") ? first.promise : second.promise;
        },
      });
      const a = await addItem(room, "first");
      const b = await addItem(room, "second");
      room.playback.currentItem = a;
      const older = manager.prepareRoomMedia(room.id, a.url);
      await nextTurn();
      room.playback.currentItem = b;
      const newer = manager.prepareRoomMedia(room.id, b.url);
      await nextTurn();
      second.resolve(source(b.url));
      assert.equal((await newer).success, true);
      const eventCount = io.events.length;
      progress.get(a.url)({ progress: 99, status: "converting" });
      assert.equal(io.events.length, eventCount);
      first.resolve(source(a.url));
      assert.equal((await older).success, false);
      assert.equal(room.playback.mediaSrc, source(b.url).src);
    },
  );

  await t.test(
    "A stale conversion failure does not cover the current movie with an error",
    async () => {
      const old = deferred();
      const { manager, room } = await fixture({
        mediaPreparer: (url) =>
          url.includes("old") ? old.promise : Promise.resolve(source(url)),
      });
      const a = await addItem(room, "old");
      const b = await addItem(room, "new");
      room.playback.currentItem = a;
      const pending = manager.prepareRoomMedia(room.id, a.url);
      await nextTurn();
      room.playback.currentItem = b;
      await manager.prepareRoomMedia(room.id, b.url);
      old.reject(new Error("Cannot read this link as video"));
      await pending;
      assert.equal(room.playback.prepareError, null);
      assert.equal(room.playback.mediaSrc, source(b.url).src);
    },
  );

  await t.test(
    "Audio preparation freezes the clock and resumes without skipping conversion time",
    async (t) => {
      const conversion = deferred();
      const { manager, room, host } = await fixture({
        mediaPreparer: () => conversion.promise,
      });
      const item = await addItem(room, "audio");
      room.playback.currentItem = item;
      let now = 10000;
      t.mock.method(Date, "now", () => now);
      Object.assign(room.playback, {
        currentTime: 10,
        isPlaying: true,
        updatedAt: 8000,
        mediaSrc: "old",
        subtitles: "old.vtt",
      });
      const pending = manager.prepareRoomMedia(room.id, item.url, 1, host);
      await nextTurn();
      assert.equal(room.playback.currentTime, 12);
      assert.equal(room.playback.isPlaying, false);
      assert.equal(room.playback.mediaSrc, null);
      assert.equal(room.playback.subtitles, null);
      now = 70000;
      conversion.resolve(source(item.url));
      await pending;
      assert.equal(room.playback.currentTime, 12);
      assert.equal(room.playback.updatedAt, 70000);
      assert.equal(room.playback.isPlaying, true);
      const saved = await repo.getRoom(room.id);
      assert.equal(saved.positionSec, 12);
    },
  );

  await t.test(
    "Restored rooms pause at the saved position and prepare media when joined",
    async () => {
      const { room } = await fixture();
      await addItem(room, "restored");
      await repo.savePlaybackState(room.id, {
        itemIndex: 0,
        playing: true,
        positionSec: 42,
        positionAt: Date.now() - 86400000,
      });
      const restored = new RoomManager(fakeIo());
      await restored.initPromise;
      const state = restored.rooms.get(room.id).playback;
      assert.equal(state.isPlaying, false);
      assert.equal(state.currentTime, 42);
      const host = socketFor(owner, room.id);
      await restored.joinRoom(host, { roomId: room.id });
      await nextTurn();
      assert.equal(state.mediaSrc, "https://example.com/restored.mp4");
      assert.equal(state.currentTime, 42);
      assert.equal(state.isPlaying, false);
    },
  );

  await t.test(
    "Joining a room regenerates an evicted converted stream",
    async () => {
      const { manager, room, host } = await fixture();
      const item = await addItem(room, "evicted");
      Object.assign(room.playback, {
        currentItem: item,
        itemIndex: 0,
        mediaKey: "wr_evicted",
        mediaSrc: "/media/wr_evicted/index.m3u8",
      });
      await manager.joinRoom(host, { roomId: room.id });
      await nextTurn();
      assert.equal(room.playback.mediaSrc, item.url);
      assert.equal(room.playback.isPreparing, false);
    },
  );

  await t.test(
    "Deleting earlier, current and final episodes keeps persisted playback consistent",
    async () => {
      const { manager, room, host } = await fixture();
      const first = await addItem(room, "one"),
        middle = await addItem(room, "two"),
        last = await addItem(room, "three");
      Object.assign(room.playback, {
        currentItem: middle,
        itemIndex: 1,
        mediaSrc: middle.url,
      });
      await manager.removeFromPlaylist(room.id, first.id, host);
      assert.equal(room.playback.currentItem.id, middle.id);
      assert.equal((await repo.getRoom(room.id)).itemIndex, 0);
      await manager.removeFromPlaylist(room.id, middle.id, host);
      await nextTurn();
      assert.equal(room.playback.currentItem.id, last.id);
      assert.equal(room.playback.mediaSrc, last.url);
      await manager.removeFromPlaylist(room.id, last.id, host);
      assert.equal(room.playback.currentItem, null);
      assert.equal(room.playback.mediaSrc, null);
      assert.deepEqual(room.playback.subtitleTracks, []);
      assert.equal((await repo.getRoom(room.id)).itemIndex, -1);
    },
  );

  await t.test(
    "Members can reorder upcoming episodes without changing the current movie",
    async () => {
      const { manager, room } = await fixture();
      const first = await addItem(room, "First");
      const second = await addItem(room, "Second");
      const third = await addItem(room, "Third");
      room.playback.currentItem = first;
      room.playback.itemIndex = 0;
      const guestSocket = socketFor(guest, room.id);

      await manager.movePlaylistItem(room.id, third.id, "up", guestSocket);

      assert.deepEqual(
        (await repo.listItems(room.id)).map((item) => item.id),
        [first.id, third.id, second.id],
      );
      assert.equal(room.playback.currentItem.id, first.id);
      assert.equal(room.playback.itemIndex, 0);
      await assert.rejects(
        manager.movePlaylistItem(room.id, first.id, "down", guestSocket),
        /current movie and earlier items cannot be moved/i,
      );
      await assert.rejects(
        manager.movePlaylistItem(
          room.id,
          second.id,
          "down",
          socketFor({ id: "stranger" }, room.id),
        ),
        /Only room members/,
      );
    },
  );

  await t.test(
    "Guests can queue a first movie in a host-only room without selecting it",
    async () => {
      const { manager, room } = await fixture();
      room.hostOnly = true;
      const guestSocket = socketFor(guest, room.id);
      await manager.addToPlaylist(
        room.id,
        { url: "https://example.com/guest.mp4" },
        guestSocket,
      );
      assert.equal((await repo.listItems(room.id)).length, 1);
      assert.equal(room.playback.currentItem, null);
      const restored = new RoomManager(fakeIo());
      await restored.initPromise;
      assert.equal(
        restored.rooms.get(room.id).playback.currentItem,
        null,
        "restart must not select a guest suggestion",
      );
      assert.equal(restored.rooms.get(room.id).playback.itemIndex, -1);
      await assert.rejects(
        manager.prepareRoomMedia(
          room.id,
          "https://example.com/guest.mp4",
          0,
          guestSocket,
        ),
        /Only the host/,
      );
    },
  );

  await t.test(
    "Preparing an arbitrary URL and removing the active movie as a guest are rejected",
    async () => {
      const { manager, room, host } = await fixture();
      const item = await addItem(room, "allowed");
      room.playback.currentItem = item;
      room.playback.itemIndex = 0;
      await assert.rejects(
        manager.prepareRoomMedia(
          room.id,
          "https://example.com/unlisted.mp4",
          0,
          host,
        ),
        /Select a playlist/,
      );
      await assert.rejects(
        manager.prepareRoomMedia(room.id, item.url, -1, host),
        /non-negative integer/,
      );
      room.hostOnly = true;
      await assert.rejects(
        manager.removeFromPlaylist(room.id, item.id, socketFor(guest, room.id)),
        /room owner/,
      );
      assert.equal((await repo.listItems(room.id)).length, 1);
    },
  );
});
