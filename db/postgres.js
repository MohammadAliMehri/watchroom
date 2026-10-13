/**
 * PostgreSQL driver implementation using `pg`.
 * Dynamic import / conditional usage as pg is only required if DATABASE_URL is set.
 */

function translatePlaceholders(sql) {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

export async function createPostgresDriver(connectionString) {
  let pg;
  try {
    pg = await import('pg');
  } catch (err) {
    throw new Error('pg package is required when DATABASE_URL is set. Run `npm install pg`.');
  }

  const { Pool } = pg.default || pg;
  const pool = new Pool({
    connectionString,
    max: 5
  });

  const driver = {
    async query(sql, params = []) {
      const pgSql = translatePlaceholders(sql);
      const res = await pool.query(pgSql, params);
      return res.rows;
    },

    async all(sql, params = []) {
      const pgSql = translatePlaceholders(sql);
      const res = await pool.query(pgSql, params);
      return res.rows;
    },

    async get(sql, params = []) {
      const pgSql = translatePlaceholders(sql);
      const res = await pool.query(pgSql, params);
      return res.rows[0] || null;
    },

    async run(sql, params = []) {
      const pgSql = translatePlaceholders(sql);
      const res = await pool.query(pgSql, params);
      return {
        changes: res.rowCount,
        lastInsertRowid: null
      };
    },

    async exec(sql) {
      await pool.query(sql);
    },

    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const clientDriver = {
          async query(sql, params = []) {
            const res = await client.query(translatePlaceholders(sql), params);
            return res.rows;
          },
          async all(sql, params = []) {
            const res = await client.query(translatePlaceholders(sql), params);
            return res.rows;
          },
          async get(sql, params = []) {
            const res = await client.query(translatePlaceholders(sql), params);
            return res.rows[0] || null;
          },
          async run(sql, params = []) {
            const res = await client.query(translatePlaceholders(sql), params);
            return { changes: res.rowCount, lastInsertRowid: null };
          },
          async exec(sql) {
            await client.query(sql);
          }
        };
        const result = await fn(clientDriver);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async close() {
      await pool.end();
    }
  };

  return driver;
}
