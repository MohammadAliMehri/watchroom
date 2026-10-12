import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'watchroom.db');
const db = new DatabaseSync(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    host_only INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playlist_items (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    duration REAL DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    text TEXT NOT NULL,
    is_system INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages(room_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_playlist_room ON playlist_items(room_id, position);
`);

export const DB = {
  getRooms() {
    return db.prepare('SELECT id, name, host_only, created_at FROM rooms ORDER BY created_at DESC').all();
  },

  getRoom(id) {
    return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
  },

  createRoom({ id, name, password, hostOnly = false }) {
    const stmt = db.prepare(`
      INSERT INTO rooms (id, name, password, host_only, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, name, password, hostOnly ? 1 : 0, Date.now());
    return { id, name, hostOnly: !!hostOnly };
  },

  deleteRoom(id) {
    db.prepare('DELETE FROM chat_messages WHERE room_id = ?').run(id);
    db.prepare('DELETE FROM playlist_items WHERE room_id = ?').run(id);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  },

  getPlaylist(roomId) {
    return db.prepare('SELECT * FROM playlist_items WHERE room_id = ? ORDER BY position ASC, created_at ASC').all(roomId);
  },

  addPlaylistItem({ id, roomId, url, title, duration = 0, position = 0 }) {
    const stmt = db.prepare(`
      INSERT INTO playlist_items (id, room_id, url, title, duration, position, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, roomId, url, title, duration, position, Date.now());
    return { id, roomId, url, title, duration, position };
  },

  removePlaylistItem(roomId, id) {
    db.prepare('DELETE FROM playlist_items WHERE room_id = ? AND id = ?').run(roomId, id);
  },

  getChatHistory(roomId, limit = 100) {
    const rows = db.prepare(`
      SELECT id, sender, text, is_system as isSystem, timestamp
      FROM chat_messages
      WHERE room_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(roomId, limit);
    return rows.reverse();
  },

  addChatMessage({ id, roomId, sender, text, isSystem = false, timestamp = Date.now() }) {
    const stmt = db.prepare(`
      INSERT INTO chat_messages (id, room_id, sender, text, is_system, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, roomId, sender, text, isSystem ? 1 : 0, timestamp);
    
    // Prune messages older than top 100 to keep chat performant
    db.exec(`
      DELETE FROM chat_messages 
      WHERE room_id = '${roomId}' 
        AND id NOT IN (
          SELECT id FROM chat_messages 
          WHERE room_id = '${roomId}' 
          ORDER BY timestamp DESC 
          LIMIT 100
        )
    `);

    return { id, sender, text, isSystem: !!isSystem, timestamp };
  }
};
