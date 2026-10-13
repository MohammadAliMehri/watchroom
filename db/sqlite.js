import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function createSqliteDriver(dbPath) {
  const resolvedPath = dbPath || process.env.DB_PATH || '/var/lib/watchroom/watchroom.db';
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(resolvedPath);

  // Enable WAL, foreign keys, busy timeout
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  return {
    async query(sql, params = []) {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    },

    async all(sql, params = []) {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    },

    async get(sql, params = []) {
      const stmt = db.prepare(sql);
      return stmt.get(...params);
    },

    async run(sql, params = []) {
      const stmt = db.prepare(sql);
      const info = stmt.run(...params);
      return {
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid
      };
    },

    async exec(sql) {
      db.exec(sql);
    },

    async transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(this);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    async close() {
      db.close();
    }
  };
}
