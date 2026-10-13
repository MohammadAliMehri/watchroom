import { getDb } from './index.js';

export function createRepo(db) {
  return {
    // --- Users ---
    async createUser({ id, email, displayName, passwordHash }) {
      const now = Date.now();
      await db.run(
        `INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, email.toLowerCase().trim(), displayName.trim(), passwordHash, now, now]
      );
      return {
        id,
        email: email.toLowerCase().trim(),
        displayName: displayName.trim(),
        createdAt: now,
        updatedAt: now
      };
    },

    async getUserByEmail(email) {
      const row = await db.get(
        `SELECT id, email, display_name AS displayName, password_hash AS passwordHash, created_at AS createdAt, updated_at AS updatedAt
         FROM users WHERE email = ?`,
        [email.toLowerCase().trim()]
      );
      return row || null;
    },

    async getUserById(id) {
      const row = await db.get(
        `SELECT id, email, display_name AS displayName, password_hash AS passwordHash, created_at AS createdAt, updated_at AS updatedAt
         FROM users WHERE id = ?`,
        [id]
      );
      return row || null;
    },

    async updateUserProfile(id, { displayName }) {
      const now = Date.now();
      await db.run(
        `UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`,
        [displayName.trim(), now, id]
      );
      return this.getUserById(id);
    },

    async updatePasswordHash(id, passwordHash) {
      const now = Date.now();
      await db.run(
        `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`,
        [passwordHash, now, id]
      );
    },

    async deleteUser(id) {
      await db.transaction(async (tx) => {
        // Cascade delete will handle sessions, rooms, etc. in sqlite/pg with foreign keys enabled
        await tx.run(`DELETE FROM users WHERE id = ?`, [id]);
      });
    },

    // --- Sessions ---
    async createSession({ tokenHash, userId, expiresAt }) {
      const now = Date.now();
      await db.run(
        `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?)`,
        [tokenHash, userId, now, expiresAt, now]
      );
      return { tokenHash, userId, createdAt: now, expiresAt, lastSeenAt: now };
    },

    async getSessionUser(tokenHash) {
      const now = Date.now();
      const row = await db.get(
        `SELECT s.token_hash AS tokenHash, s.user_id AS userId, s.expires_at AS expiresAt, s.last_seen_at AS lastSeenAt,
                u.id, u.email, u.display_name AS displayName, u.created_at AS createdAt
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
        [tokenHash]
      );

      if (!row) return null;
      if (row.expiresAt <= now) {
        return null;
      }

      return {
        session: {
          tokenHash: row.tokenHash,
          userId: row.userId,
          expiresAt: row.expiresAt,
          lastSeenAt: row.lastSeenAt
        },
        user: {
          id: row.id,
          email: row.email,
          displayName: row.displayName,
          createdAt: row.createdAt
        }
      };
    },

    async touchSession(tokenHash, newExpiresAt) {
      const now = Date.now();
      await db.run(
        `UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?`,
        [now, newExpiresAt, tokenHash]
      );
    },

    async deleteSession(tokenHash) {
      await db.run(`DELETE FROM sessions WHERE token_hash = ?`, [tokenHash]);
    },

    async deleteUserSessions(userId, keepTokenHash = null) {
      if (keepTokenHash) {
        await db.run(
          `DELETE FROM sessions WHERE user_id = ? AND token_hash != ?`,
          [userId, keepTokenHash]
        );
      } else {
        await db.run(`DELETE FROM sessions WHERE user_id = ?`, [userId]);
      }
    },

    async purgeExpiredSessions() {
      const now = Date.now();
      await db.run(`DELETE FROM sessions WHERE expires_at <= ?`, [now]);
    },

    // --- Rooms ---
    async createRoom({ id, ownerId, name, passwordHash }) {
      const now = Date.now();
      await db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO rooms (id, owner_id, name, password_hash, item_index, playing, position_sec, position_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, -1, 0, 0, 0, ?, ?)`,
          [id, ownerId, name.trim(), passwordHash || '', now, now]
        );
        // Owner automatically becomes a room member
        await tx.run(
          `INSERT INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)`,
          [id, ownerId, now]
        );
      });

      return {
        id,
        ownerId,
        name: name.trim(),
        itemIndex: -1,
        playing: 0,
        positionSec: 0,
        positionAt: 0,
        createdAt: now,
        updatedAt: now
      };
    },

    async getRoom(id) {
      const row = await db.get(
        `SELECT r.id, r.owner_id AS ownerId, r.name, r.password_hash AS passwordHash,
                r.item_index AS itemIndex, r.playing, r.position_sec AS positionSec,
                r.position_at AS positionAt, r.created_at AS createdAt, r.updated_at AS updatedAt,
                u.display_name AS ownerName
         FROM rooms r
         JOIN users u ON u.id = r.owner_id
         WHERE r.id = ?`,
        [id]
      );
      if (!row) return null;
      return {
        ...row,
        playing: !!row.playing
      };
    },

    async listRoomsForUser(userId) {
      const rows = await db.all(
        `SELECT r.id, r.name, r.owner_id AS ownerId, u.display_name AS ownerName,
                r.playing, r.item_index AS itemIndex,
                (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) AS memberCount
         FROM rooms r
         JOIN users u ON u.id = r.owner_id
         WHERE r.owner_id = ? OR EXISTS (
           SELECT 1 FROM room_members rm2 WHERE rm2.room_id = r.id AND rm2.user_id = ?
         )
         ORDER BY r.updated_at DESC`,
        [userId, userId]
      );

      // Fetch nowPlaying for each room
      const results = [];
      for (const row of rows) {
        let nowPlaying = null;
        if (row.itemIndex >= 0) {
          const item = await db.get(
            `SELECT id, title, url FROM playlist_items WHERE room_id = ? AND position = ?`,
            [row.id, row.itemIndex]
          );
          if (item) {
            nowPlaying = item.title;
          }
        }
        results.push({
          id: row.id,
          name: row.name,
          ownerName: row.ownerName,
          memberCount: Number(row.memberCount) || 0,
          playing: !!row.playing,
          nowPlaying
        });
      }
      return results;
    },

    async getAllRooms() {
      const rows = await db.all(
        `SELECT r.id, r.owner_id AS ownerId, r.name, r.password_hash AS passwordHash,
                r.item_index AS itemIndex, r.playing, r.position_sec AS positionSec,
                r.position_at AS positionAt, r.created_at AS createdAt, r.updated_at AS updatedAt,
                u.display_name AS ownerName
         FROM rooms r
         JOIN users u ON u.id = r.owner_id`
      );
      return rows.map(r => ({ ...r, playing: !!r.playing }));
    },

    async updateRoom(id, { name }) {
      const now = Date.now();
      await db.run(
        `UPDATE rooms SET name = ?, updated_at = ? WHERE id = ?`,
        [name.trim(), now, id]
      );
      return this.getRoom(id);
    },

    async deleteRoom(id) {
      await db.transaction(async (tx) => {
        await tx.run(`DELETE FROM rooms WHERE id = ?`, [id]);
      });
    },

    async savePlaybackState(id, { itemIndex, playing, positionSec, positionAt }) {
      const now = Date.now();
      await db.run(
        `UPDATE rooms
         SET item_index = ?, playing = ?, position_sec = ?, position_at = ?, updated_at = ?
         WHERE id = ?`,
        [
          itemIndex !== undefined ? itemIndex : -1,
          playing ? 1 : 0,
          positionSec !== undefined ? positionSec : 0,
          positionAt !== undefined ? positionAt : 0,
          now,
          id
        ]
      );
    },

    // --- Playlist ---
    async listItems(roomId) {
      const rows = await db.all(
        `SELECT id, room_id AS roomId, position, url, title, format,
                duration_sec AS durationSec, added_by AS addedBy, created_at AS createdAt
         FROM playlist_items
         WHERE room_id = ?
         ORDER BY position ASC, created_at ASC`,
        [roomId]
      );
      return rows;
    },

    async addItem({ id, roomId, position, url, title, format, durationSec = 0, addedBy = null }) {
      const now = Date.now();
      await db.run(
        `INSERT INTO playlist_items (id, room_id, position, url, title, format, duration_sec, added_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, roomId, position, url, title, format, durationSec, addedBy, now]
      );
      return { id, roomId, position, url, title, format, durationSec, addedBy, createdAt: now };
    },

    async removeItem(roomId, itemId) {
      await db.transaction(async (tx) => {
        const item = await tx.get(`SELECT position FROM playlist_items WHERE room_id = ? AND id = ?`, [roomId, itemId]);
        if (!item) return;
        await tx.run(`DELETE FROM playlist_items WHERE room_id = ? AND id = ?`, [roomId, itemId]);
        // Compact positions
        await tx.run(
          `UPDATE playlist_items SET position = position - 1 WHERE room_id = ? AND position > ?`,
          [roomId, item.position]
        );
      });
    },

    async reorderItems(roomId, itemIds) {
      await db.transaction(async (tx) => {
        for (let i = 0; i < itemIds.length; i++) {
          await tx.run(
            `UPDATE playlist_items SET position = ? WHERE room_id = ? AND id = ?`,
            [i, itemIds[i], roomId]
          );
        }
      });
    },

    // --- Members ---
    async addMember(roomId, userId) {
      const now = Date.now();
      // Insert or ignore if already member
      const existing = await db.get(
        `SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`,
        [roomId, userId]
      );
      if (!existing) {
        await db.run(
          `INSERT INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)`,
          [roomId, userId, now]
        );
      }
    },

    async isMember(roomId, userId) {
      const row = await db.get(
        `SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`,
        [roomId, userId]
      );
      return !!row;
    },

    async listMembers(roomId) {
      const rows = await db.all(
        `SELECT u.id, u.display_name AS displayName, rm.joined_at AS joinedAt
         FROM room_members rm
         JOIN users u ON u.id = rm.user_id
         WHERE rm.room_id = ?
         ORDER BY rm.joined_at ASC`,
        [roomId]
      );
      return rows;
    },

    // --- Messages ---
    async addMessage({ id, roomId, userId = null, nick, text }) {
      const now = Date.now();
      await db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO messages (id, room_id, user_id, nick, text, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, roomId, userId, nick, text, now]
        );

        // Keep only the last 200 messages per room. Delete older ones.
        // Handled cleanly across SQLite & Postgres using a subquery
        await tx.run(
          `DELETE FROM messages
           WHERE room_id = ?
             AND id NOT IN (
               SELECT id FROM messages
               WHERE room_id = ?
               ORDER BY created_at DESC
               LIMIT 200
             )`,
          [roomId, roomId]
        );
      });

      return { id, roomId, userId, nick, text, createdAt: now };
    },

    async listMessages(roomId, limit = 200) {
      const rows = await db.all(
        `SELECT id, room_id AS roomId, user_id AS userId, nick, text, created_at AS createdAt
         FROM messages
         WHERE room_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [roomId, limit]
      );
      return rows.reverse();
    }
  };
}

let defaultRepo = null;
export async function getRepo() {
  if (!defaultRepo) {
    const db = await getDb();
    defaultRepo = createRepo(db);
  }
  return defaultRepo;
}
