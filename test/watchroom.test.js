import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateUrl, isForbiddenIp } from '../src/security.js';
import { DB } from '../src/db.js';
import { probeSource, prepareMedia, getJobKey, MEDIA_DIR } from '../src/converter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

test('Database: Room, Playlist, and Chat persistence with node:sqlite', () => {
  const roomId = 'test_room_' + Date.now();
  
  // Create room
  DB.createRoom({ id: roomId, name: 'Cinema Club', password: 'secretpassword', hostOnly: true });
  const room = DB.getRoom(roomId);
  assert.ok(room);
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

test('Converter: Probes and converts MKV to HLS with ffprobe & ffmpeg', async () => {
  const testMkvPath = path.join(__dirname, '..', 'test.mkv');
  assert.ok(fs.existsSync(testMkvPath), 'test.mkv must exist');

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
