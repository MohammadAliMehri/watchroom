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
