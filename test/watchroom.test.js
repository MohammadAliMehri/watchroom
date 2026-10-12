import test from 'node:test';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchroom-test-'));
process.env.MEDIA_DIR = path.join(testDir, 'media');
process.env.DATA_DIR = path.join(testDir, 'data');
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const seedDb = new DatabaseSync(path.join(process.env.DATA_DIR, 'watchroom.db'));
seedDb.exec(`
  CREATE TABLE rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    host_only INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`);
seedDb.prepare('INSERT INTO rooms (id, name, password, host_only, created_at) VALUES (?, ?, ?, ?, ?)')
  .run('legacy_room', 'Legacy Room', 'legacy-password', 1, Date.now());
seedDb.close();

const { validateUrl, isForbiddenIp, assertMediaEgressProtection } = await import('../src/security.js');
const { DB } = await import('../src/db.js');
const { probeSource, prepareMedia, getJobKey, MEDIA_DIR } = await import('../src/converter.js');
const { RoomManager } = await import('../src/roomManager.js');

function createFakeIo() {
  return {
    events: [],
    emit(event, payload) {
      this.events.push({ room: null, event, payload });
    },
    to(room) {
      return {
        emit: (event, payload) => this.events.push({ room, event, payload })
      };
    }
  };
}

function createFakeSocket(id) {
  return {
    id,
    data: {},
    rooms: new Set(),
    events: [],
    join(room) { this.rooms.add(room); },
    leave(room) { this.rooms.delete(room); },
    emit(event, payload) { this.events.push({ event, payload }); }
  };
}

function createTestMkv(filePath) {
  const generated = spawnSync('ffmpeg', [
    '-v', 'error',
    '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10:d=1',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', '1', '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
    filePath
  ], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr || 'ffmpeg fixture generation failed');
}

after(() => {
  DB.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('Security: Blocks forbidden IP ranges and protocols (Layer 1 SSRF)', async () => {
  // Protocol check
  await assert.rejects(async () => {
    await validateUrl('ftp://example.com/movie.mkv');
  }, /That address is not allowed/);

  await assert.rejects(async () => {
    await validateUrl('file:///etc/passwd');
  }, /That address is not allowed/);

  // Forbidden IP checks
  assert.equal(isForbiddenIp('127.0.0.1'), true);
  assert.equal(isForbiddenIp('10.0.0.1'), true);
  assert.equal(isForbiddenIp('172.16.5.1'), true);
  assert.equal(isForbiddenIp('192.168.1.1'), true);
  assert.equal(isForbiddenIp('169.254.169.254'), true);
  assert.equal(isForbiddenIp('100.64.0.1'), true);
  assert.equal(isForbiddenIp('::1'), true);

  // Public IP
  assert.equal(isForbiddenIp('8.8.8.8'), false);
  assert.equal(isForbiddenIp('1.1.1.1'), false);
});

test('Security: Requires an egress boundary before remote media processing', async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    protected: process.env.MEDIA_EGRESS_PROTECTED,
    override: process.env.ALLOW_UNSAFE_MEDIA_FETCHES
  };
  process.env.NODE_ENV = 'production';
  delete process.env.MEDIA_EGRESS_PROTECTED;
  delete process.env.ALLOW_UNSAFE_MEDIA_FETCHES;

  try {
    assert.throws(
      () => assertMediaEgressProtection('https://example.com/movie.mkv'),
      /OS-level egress protection/
    );
    await assert.rejects(
      probeSource('https://example.com/movie.mkv'),
      /OS-level egress protection/
    );
    assert.throws(() => assertMediaEgressProtection('ftp://example.com/movie.mkv'), /not allowed/);
    process.env.MEDIA_EGRESS_PROTECTED = 'true';
    assert.doesNotThrow(() => assertMediaEgressProtection('https://example.com/movie.mkv'));
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.protected === undefined) delete process.env.MEDIA_EGRESS_PROTECTED;
    else process.env.MEDIA_EGRESS_PROTECTED = previous.protected;
    if (previous.override === undefined) delete process.env.ALLOW_UNSAFE_MEDIA_FETCHES;
    else process.env.ALLOW_UNSAFE_MEDIA_FETCHES = previous.override;
  }
});

test('Database: Room, Playlist, and Chat persistence with node:sqlite', () => {
  const roomId = 'test_room_' + Date.now();

  const legacyRoom = DB.getRoom('legacy_room');
  assert.notEqual(legacyRoom.password, 'legacy-password');
  assert.match(legacyRoom.password, /^scrypt\$/);
  assert.equal(DB.verifyRoomPassword('legacy_room', 'legacy-password'), true);
  assert.equal(DB.verifyRoomPassword('legacy_room', 'wrong-password'), false);
  assert.equal(DB.getRooms().find(room => room.id === 'legacy_room').password, undefined);
  const restoredManager = new RoomManager(createFakeIo());
  const restoredSocket = createFakeSocket('restored-room-socket');
  assert.throws(
    () => restoredManager.joinRoom(restoredSocket, { roomId: 'legacy_room', password: '', userName: 'Guest' }),
    /Wrong password/
  );
  assert.throws(
    () => restoredManager.joinRoom(restoredSocket, { roomId: 'legacy_room', password: 'wrong-password', userName: 'Guest' }),
    /Wrong password/
  );
  assert.equal(
    restoredManager.joinRoom(restoredSocket, { roomId: 'legacy_room', password: 'legacy-password', userName: 'Guest' }).isHost,
    true
  );
  restoredManager.leaveRoom(restoredSocket);
  DB.deleteRoom('legacy_room');

  // Create room
  DB.createRoom({ id: roomId, name: 'Cinema Club', password: 'secretpassword', hostOnly: true });
  const room = DB.getRoom(roomId);
  assert.ok(room);
  assert.notEqual(room.password, 'secretpassword');
  assert.equal(DB.verifyRoomPassword(roomId, 'secretpassword'), true);
  assert.equal(room.name, 'Cinema Club');
  assert.equal(room.host_only, 1);

  // Playlist
  DB.addPlaylistItem({
    id: 'pl_1',
    roomId,
    url: 'https://example.com/test.mkv',
    title: 'Test Movie',
    duration: 120,
    position: 0
  });
  const playlist = DB.getPlaylist(roomId);
  assert.equal(playlist.length, 1);
  assert.equal(playlist[0].title, 'Test Movie');

  // Chat
  DB.addChatMessage({
    id: 'chat_1',
    roomId,
    sender: 'Alice',
    text: 'Hello world!',
    isSystem: false,
    timestamp: Date.now()
  });
  const history = DB.getChatHistory(roomId);
  assert.equal(history.length, 1);
  assert.equal(history[0].text, 'Hello world!');
  assert.equal(history[0].sender, 'Alice');

  // Clean up test room
  DB.deleteRoom(roomId);
  assert.equal(DB.getRoom(roomId), undefined);
});

test('Rooms: Rejoining a different room removes prior membership and host role', () => {
  const manager = new RoomManager(createFakeIo());
  const first = manager.createRoom({ name: 'First room', password: 'first-pass' });
  const second = manager.createRoom({ name: 'Second room', password: 'second-pass' });
  const socket = createFakeSocket('socket-switch');

  try {
    manager.joinRoom(socket, { roomId: first.id, password: 'first-pass', userName: 'Alex' });
    assert.throws(
      () => manager.joinRoom(socket, { roomId: second.id, password: 'wrong-pass', userName: 'Alex' }),
      /Wrong password/
    );
    assert.equal(manager.rooms.get(first.id).members.has(socket.id), true);
    manager.joinRoom(socket, { roomId: second.id, password: 'second-pass', userName: 'Alex' });

    assert.equal(manager.rooms.get(first.id).members.has(socket.id), false);
    assert.equal(manager.rooms.get(first.id).hostSocketId, null);
    assert.equal(manager.rooms.get(second.id).members.has(socket.id), true);
    assert.deepEqual(Array.from(socket.rooms), [second.id]);
    assert.equal(socket.data.roomId, second.id);
  } finally {
    manager.leaveRoom(socket);
    DB.deleteRoom(first.id);
    DB.deleteRoom(second.id);
  }
});

test('Rooms: Host-only mode rejects guest controls and media preparation', async () => {
  const manager = new RoomManager(createFakeIo());
  const room = manager.createRoom({ name: 'Host room', password: 'room-pass', hostOnly: true });
  const host = createFakeSocket('socket-host');
  const guest = createFakeSocket('socket-guest');

  try {
    manager.joinRoom(host, { roomId: room.id, password: 'room-pass', userName: 'Host' });
    manager.joinRoom(guest, { roomId: room.id, password: 'room-pass', userName: 'Guest' });

    manager.handleControl(guest, { action: 'play' });
    assert.equal(room.playback.isPlaying, false);
    assert.equal(manager.canControl(guest, room.id), false);
    assert.equal(manager.canControl(host, room.id), true);
    await assert.rejects(
      manager.prepareRoomMedia(room.id, 'http://8.8.8.8/movie.mkv', 0, guest),
      /Only the host can prepare media/
    );

    const item = await manager.addToPlaylist(room.id, { url: 'http://8.8.8.8/movie.mkv' }, guest);
    assert.equal(item.title, 'movie.mkv');
    assert.equal(room.playback.currentItem, null);
    manager.handleControl(host, { action: 'play' });
    assert.equal(room.playback.isPlaying, true);
  } finally {
    manager.leaveRoom(guest);
    manager.leaveRoom(host);
    DB.deleteRoom(room.id);
  }
});

test('Converter: Probes and converts MKV to HLS with ffprobe & ffmpeg', async () => {
  const testMkvPath = path.join(testDir, 'test.mkv');
  createTestMkv(testMkvPath);

  // Probe
  const probe = await probeSource(testMkvPath);
  assert.equal(probe.isH264, true);
  assert.ok(probe.duration > 0);
  assert.ok(probe.audioStreams.length > 0);

  // Convert to HLS
  let progressUpdates = 0;
  const result = await prepareMedia(testMkvPath, 0, (p) => {
    progressUpdates++;
  });

  assert.equal(result.type, 'hls');
  assert.ok(result.src.includes('index.m3u8'));

  const key = getJobKey(testMkvPath, 0);
  const m3u8Path = path.join(MEDIA_DIR, key, 'index.m3u8');
  assert.ok(fs.existsSync(m3u8Path), 'HLS index.m3u8 must be generated');

  const content = fs.readFileSync(m3u8Path, 'utf8');
  assert.ok(content.includes('#EXTM3U'), 'Valid HLS playlist format');
});

test('Converter: Rejects redirects from HTTP to local file protocols', async () => {
  const testMkvPath = path.join(testDir, 'redirect-target.mkv');
  createTestMkv(testMkvPath);
  const redirectServer = http.createServer((request, response) => {
    response.writeHead(302, { Location: pathToFileURL(testMkvPath).href });
    response.end();
  });
  await new Promise((resolve, reject) => {
    redirectServer.once('error', reject);
    redirectServer.listen(0, '127.0.0.1', resolve);
  });

  const previousProtection = process.env.MEDIA_EGRESS_PROTECTED;
  process.env.MEDIA_EGRESS_PROTECTED = 'true';
  try {
    const { port } = redirectServer.address();
    await assert.rejects(
      probeSource(`http://127.0.0.1:${port}/redirect`),
      /Cannot read this link as video/
    );
  } finally {
    if (previousProtection === undefined) delete process.env.MEDIA_EGRESS_PROTECTED;
    else process.env.MEDIA_EGRESS_PROTECTED = previousProtection;
    await new Promise(resolve => redirectServer.close(resolve));
  }
});

test('Converter: Shares duplicate jobs and enforces the concurrent job limit', async () => {
  const duplicateSource = path.join(testDir, 'duplicate.mkv');
  createTestMkv(duplicateSource);
  const duplicateResults = await Promise.all([
    prepareMedia(duplicateSource),
    prepareMedia(duplicateSource)
  ]);
  assert.deepEqual(duplicateResults[0], duplicateResults[1]);

  const remainingSources = Array.from({ length: 3 }, (_, index) => {
    const filePath = path.join(testDir, `capacity-${index}.mkv`);
    fs.copyFileSync(duplicateSource, filePath);
    return filePath;
  });
  const results = await Promise.allSettled(remainingSources.map(source => prepareMedia(source)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message, /busy with other movies/);
});
