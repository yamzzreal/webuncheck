const { sql } = require("@vercel/postgres");
const crypto = require("crypto");

function json(res, status, data) {
  if (!res.headersSent) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  return res.end(JSON.stringify(data));
}

function dbConfigured() {
  return Boolean(
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

async function initDb() {
  if (!dbConfigured()) {
    throw new Error("Database belum dikonfigurasi. Tambahkan POSTGRES_URL di Vercel.");
  }
  await sql`CREATE TABLE IF NOT EXISTS inbox_keys (
    id SERIAL PRIMARY KEY,
    key_value TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE
  )`;
}

function makeKey(prefix = "FREE") {
  return prefix + "_" + crypto.randomBytes(18).toString("hex").toUpperCase();
}

function durationMs(amount, unit) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Durasi harus lebih dari 0.");
  const units = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000
  };
  if (!units[unit]) throw new Error("Satuan durasi tidak valid.");
  return n * units[unit];
}

function cookie(res, name, value, maxAge = 86400) {
  res.setHeader(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}`
  );
}

function clearCookie(res, name) {
  cookie(res, name, "", 0);
}

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const found = raw.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}

async function requireUser(req, res) {
  const key = getCookie(req, "yamzz_inbox_key");
  if (!key) {
    json(res, 401, { success: false, message: "Belum login. Silakan masukkan access key." });
    return null;
  }

  try {
    await initDb();
    const result = await sql`
      SELECT id,key_value,plan,expires_at,created_at,active
      FROM inbox_keys
      WHERE key_value=${key}
      LIMIT 1
    `;
    const row = result.rows[0];

    if (!row || !row.active) {
      clearCookie(res, "yamzz_inbox_key");
      json(res, 401, { success: false, message: "Key tidak valid atau sudah dinonaktifkan." });
      return null;
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      clearCookie(res, "yamzz_inbox_key");
      json(res, 401, { success: false, message: "Key sudah expired." });
      return null;
    }

    return row;
  } catch (error) {
    json(res, 500, {
      success: false,
      message: "Database tidak dapat diakses.",
      error: error.message
    });
    return null;
  }
}

function adminToken() {
  const secret = process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || "";
  return secret
    ? crypto.createHmac("sha256", secret).update("yamzz-admin").digest("hex")
    : "";
}

function adminOk(req) {
  const got = getCookie(req, "yamzz_admin");
  const expected = adminToken();
  return Boolean(expected && got && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected)));
}

module.exports = {
  sql, initDb, dbConfigured, makeKey, durationMs,
  cookie, clearCookie, getCookie, json, requireUser,
  adminOk, adminToken
};
