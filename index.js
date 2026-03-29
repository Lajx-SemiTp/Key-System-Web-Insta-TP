const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Mohssen2';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

const apiLimiter = rateLimit({ windowMs: 60*1000, max: 60, message: { success: false, message: 'Too many requests' } });
app.use('/api/', apiLimiter);

function now() { return Math.floor(Date.now() / 1000); }

function generateKey() {
  const seg = () => uuidv4().replace(/-/g, '').toUpperCase().slice(0, 4);
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

async function syncExpired() {
  await db.run(`UPDATE keys SET status='expired' WHERE status='active' AND expires_at < ?`, [now()]);
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) res.json({ success: true });
  else res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
});

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_PASSWORD) return res.status(401).json({ success: false, message: 'No autorizado' });
  next();
}

app.post('/api/admin/keys', adminAuth, async (req, res) => {
  const { duration_days, duration_val, duration_unit, owner, note, custom_key } = req.body;
  if (!duration_days || isNaN(duration_days) || duration_days < 0)
    return res.status(400).json({ success: false, message: 'Invalid duration' });
  const key = custom_key?.trim() ? custom_key.trim().toUpperCase() : generateKey();
  const createdAt = now();
  const expiresAt = createdAt + Math.round(duration_days * 86400);
  try {
    await db.run(
      `INSERT INTO keys (key, product, duration_val, duration_unit, duration_days, owner, created_at, expires_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [key, 'InstaTP', duration_val || null, duration_unit || 'days', duration_days, owner || '', createdAt, expiresAt, note || '']
    );
    res.json({ success: true, key, expires_at: expiresAt });
  } catch { res.status(409).json({ success: false, message: 'Key already exists' }); }
});

app.get('/api/admin/keys', adminAuth, async (req, res) => {
  await syncExpired();
  const keys = await db.all(`SELECT * FROM keys ORDER BY created_at DESC`);
  res.json({ success: true, keys });
});

app.delete('/api/admin/keys/:key', adminAuth, async (req, res) => {
  const result = await db.run(`DELETE FROM keys WHERE key = ?`, [req.params.key]);
  if (result.changes === 0) return res.status(404).json({ success: false, message: 'Key not found' });
  res.json({ success: true });
});

app.patch('/api/admin/keys/:key/reset-hwid', adminAuth, async (req, res) => {
  const result = await db.run(`UPDATE keys SET hwid = NULL WHERE key = ?`, [req.params.key]);
  if (result.changes === 0) return res.status(404).json({ success: false, message: 'Key not found' });
  res.json({ success: true });
});

app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.get('/api/check-hwid/:hwid', async (req, res) => {
  await syncExpired();
  const entry = await db.get(
    `SELECT * FROM keys WHERE hwid = ? AND status = 'active' ORDER BY expires_at DESC LIMIT 1`,
    [req.params.hwid]
  );
  if (!entry) return res.json({ found: false });
  res.json({ found: true, key: entry.key, product: entry.product, expires_at: entry.expires_at });
});

app.get('/api/validate/:key', async (req, res) => {
  await syncExpired();
  const entry = await db.get(`SELECT * FROM keys WHERE key = ?`, [req.params.key.toUpperCase()]);
  if (!entry) return res.json({ valid: false, reason: 'Key not found' });
  if (entry.status === 'expired') return res.json({ valid: false, reason: 'Key expired' });
  res.json({ valid: true, key: entry.key, product: entry.product, hwid: entry.hwid, expires_at: entry.expires_at, status: entry.status });
});

app.post('/api/hwid', async (req, res) => {
  await syncExpired();
  const { key, hwid } = req.body;
  if (!key || !hwid) return res.status(400).json({ success: false, message: 'Missing key or hwid' });
  const entry = await db.get(`SELECT * FROM keys WHERE key = ?`, [key.toUpperCase()]);
  if (!entry) return res.json({ success: false, reason: 'Key not found' });
  if (entry.status === 'expired') return res.json({ success: false, reason: 'Key expired' });
  if (!entry.hwid) {
    await db.run(`UPDATE keys SET hwid = ? WHERE key = ?`, [hwid, key.toUpperCase()]);
    return res.json({ success: true, message: 'HWID registered' });
  }
  if (entry.hwid === hwid) return res.json({ success: true, message: 'HWID verified' });
  return res.json({ success: false, reason: 'HWID mismatch' });
});

app.get('/api/expiry/:key', async (req, res) => {
  const entry = await db.get(`SELECT expires_at, status FROM keys WHERE key = ?`, [req.params.key.toUpperCase()]);
  if (!entry) return res.json({ found: false });
  const remaining = entry.expires_at - now();
  res.json({ found: true, expires_at: entry.expires_at, remaining_seconds: Math.max(0, remaining), expired: remaining <= 0 });
});

db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`Keys System Insta TP running on port ${PORT}`);
    setInterval(() => {
      const http = require('http');
      http.get(`http://localhost:${PORT}/api/ping`, () => {}).on('error', () => {});
    }, 10 * 60 * 1000);
  });
}).catch(err => { console.error('Database connection failed:', err.message); process.exit(1); });
