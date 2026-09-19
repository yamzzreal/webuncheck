const { sql } = require('@vercel/postgres');
const crypto = require('crypto');

function json(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function durationMs(amount, unit) {
  const n = Number(amount);
  const map = {
    minute: 60000,
    hour: 3600000,
    day: 86400000,
    week: 604800000,
    month: 2592000000,
    year: 31536000000
  };
  if (!Number.isFinite(n) || n <= 0 || !map[unit]) throw new Error('Durasi key Free tidak valid');
  return n * map[unit];
}

async function ensureTable() {
  await sql`CREATE TABLE IF NOT EXISTS inbox_keys (
    id SERIAL PRIMARY KEY,
    key_value TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE
  )`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return json(res, 405, { success: false, message: 'Method not allowed. Gunakan POST.' });
  }

  try {
    if (String(process.env.FREE_KEY_PUBLIC ?? 'true').toLowerCase() !== 'true') {
      return json(res, 403, { success: false, message: 'Generate key Free sedang dinonaktifkan admin.' });
    }

    if (!process.env.POSTGRES_URL) {
      return json(res, 500, { success: false, message: 'POSTGRES_URL belum dikonfigurasi di Vercel.' });
    }

    await ensureTable();

    const duration = Number(process.env.FREE_KEY_DURATION || 1);
    const unit = String(process.env.FREE_KEY_UNIT || 'day').toLowerCase();
    const expires = new Date(Date.now() + durationMs(duration, unit));
    const key = 'FREE_' + crypto.randomBytes(5).toString('hex').toUpperCase();

    await sql`INSERT INTO inbox_keys (key_value, plan, expires_at)
               VALUES (${key}, 'free', ${expires.toISOString()})`;

    return json(res, 200, {
      success: true,
      key,
      plan: 'free',
      duration,
      unit,
      expires_at: expires.toISOString()
    });
  } catch (e) {
    console.error('free-key:', e);
    return json(res, 500, {
      success: false,
      message: 'Gagal membuat key Free.',
      error: e && e.message ? e.message : String(e)
    });
  }
};
