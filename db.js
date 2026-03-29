const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS keys (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      product TEXT DEFAULT 'InstaTP',
      duration_val INTEGER,
      duration_unit TEXT DEFAULT 'days',
      duration_days REAL NOT NULL,
      owner TEXT DEFAULT '',
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      hwid TEXT DEFAULT NULL,
      status TEXT DEFAULT 'active',
      note TEXT DEFAULT ''
    )
  `);
  console.log('Database ready');
}

async function run(sql, params = []) {
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  const res = await pool.query(pgSql, params);
  return { changes: res.rowCount, lastID: res.rows[0]?.id };
}

async function get(sql, params = []) {
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  const res = await pool.query(pgSql, params);
  return res.rows[0] || null;
}

async function all(sql, params = []) {
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  const res = await pool.query(pgSql, params);
  return res.rows;
}

module.exports = { init, run, get, all };
