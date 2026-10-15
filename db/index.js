import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqliteDriver } from './sqlite.js';
import { createPostgresDriver } from './postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let currentDriver = null;

export async function getDb(options = {}) {
  if (currentDriver && !options.forceNew) {
    return currentDriver;
  }

  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
    currentDriver = await createPostgresDriver(databaseUrl);
  } else {
    const dbPath = options.dbPath || process.env.DB_PATH;
    currentDriver = createSqliteDriver(dbPath);
  }

  return currentDriver;
}

export async function runMigrations(driver) {
  // Ensure schema_migrations table exists
  await driver.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  // Migrate legacy SQLite rooms table if older schema columns exist/missing
  try {
    const tableInfo = await driver.all("PRAGMA table_info(rooms)");
    if (tableInfo && tableInfo.length > 0) {
      const colNames = new Set(tableInfo.map(c => c.name));
      if (!colNames.has('owner_id')) {
        await driver.exec("ALTER TABLE rooms ADD COLUMN owner_id TEXT;");
      }
      if (!colNames.has('password_hash')) {
        await driver.exec("ALTER TABLE rooms ADD COLUMN password_hash TEXT;");
        if (colNames.has('password')) {
          await driver.exec("UPDATE rooms SET password_hash = password WHERE password_hash IS NULL;");
        }
      }
      if (colNames.has('password')) {
        try {
          await driver.exec("ALTER TABLE rooms DROP COLUMN password;");
        } catch { }
      }
      if (!colNames.has('item_index')) {
        await driver.exec("ALTER TABLE rooms ADD COLUMN item_index INTEGER NOT NULL DEFAULT -1;");
      }
      if (!colNames.has('playing')) {
        await driver.exec("ALTER TABLE rooms ADD COLUMN playing INTEGER NOT NULL DEFAULT 0;");
      }
      if (!colNames.has('position_sec')) {
        await driver.exec("ALTER TABLE rooms ADD COLUMN position_sec REAL NOT NULL DEFAULT 0;");
      }
      if (!colNames.has('position_at')) {
        await driver.exec("ALTER TABLE rooms ADD COLUMN position_at INTEGER NOT NULL DEFAULT 0;");
      }
      if (!colNames.has('updated_at')) {
        await driver.exec("ALTER TABLE rooms ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;");
        if (colNames.has('created_at')) {
          await driver.exec("UPDATE rooms SET updated_at = created_at WHERE updated_at = 0;");
        }
      }
    }
  } catch { }

  // Migrate legacy SQLite playlist_items table if format or duration_sec are missing
  try {
    const tableInfo = await driver.all("PRAGMA table_info(playlist_items)");
    if (tableInfo && tableInfo.length > 0) {
      const colNames = new Set(tableInfo.map(c => c.name));
      if (!colNames.has('format')) {
        await driver.exec("ALTER TABLE playlist_items ADD COLUMN format TEXT NOT NULL DEFAULT 'mp4';");
      }
      if (!colNames.has('duration_sec')) {
        await driver.exec("ALTER TABLE playlist_items ADD COLUMN duration_sec REAL NOT NULL DEFAULT 0;");
        if (colNames.has('duration')) {
          await driver.exec("UPDATE playlist_items SET duration_sec = duration WHERE duration_sec = 0;");
        }
      }
      if (!colNames.has('added_by')) {
        await driver.exec("ALTER TABLE playlist_items ADD COLUMN added_by TEXT;");
      }
    }
  } catch { }

  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const row = await driver.get('SELECT name FROM schema_migrations WHERE name = ?', [file]);
    if (!row) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await driver.transaction(async (tx) => {
        // Execute migration sql statements
        // For both sqlite and postgres, multiple statements can be run in batch via exec
        await tx.exec(sql);
        await tx.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [file, Date.now()]);
      });
    }
  }
}

export async function initDb(options = {}) {
  const driver = await getDb(options);
  await runMigrations(driver);
  return driver;
}
