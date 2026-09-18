const { sql } = require('@vercel/postgres');

async function initDb() {
  await sql`CREATE TABLE IF NOT EXISTS inbox_keys (
    id SERIAL PRIMARY KEY,
    key_value TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE
  )`;
}

function makeKey(prefix='YMZ') {
  const crypto = require('crypto');
  return prefix + '_' + crypto.randomBytes(18).toString('hex').toUpperCase();
}

function parseDuration(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Durasi harus berupa angka lebih dari 0');
  return n;
}

function durationMs(amount, unit) {
  const map = { minute:60000, hour:3600000, day:86400000, week:604800000, month:2592000000, year:31536000000 };
  if (!map[unit]) throw new Error('Satuan durasi tidak valid');
  return parseDuration(amount) * map[unit];
}

function cookie(res, name, value, maxAge=86400) {
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}
function clearCookie(res, name) {
  res.setHeader('Set-Cookie', `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
function getCookie(req, name) {
  const raw=req.headers.cookie||'';
  const part=raw.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
  return part ? decodeURIComponent(part.slice(name.length+1)) : '';
}
function json(res,status,data){res.status(status).setHeader('Content-Type','application/json');res.end(JSON.stringify(data));}

async function requireUser(req,res) {
  const key=getCookie(req,'yamzz_inbox_key');
  if(!key){json(res,401,{success:false,message:'Belum login'});return null;}
  await initDb();
  const r=await sql`SELECT id,key_value,plan,expires_at,created_at,active FROM inbox_keys WHERE key_value=${key} LIMIT 1`;
  const row=r.rows[0];
  if(!row || !row.active || new Date(row.expires_at).getTime() <= Date.now()) {
    clearCookie(res,'yamzz_inbox_key');
    json(res,401,{success:false,message:'Key tidak ditemukan atau sudah expired'});return null;
  }
  return row;
}

const crypto = require('crypto');
function adminToken(){
  const secret=process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || '';
  return secret ? crypto.createHmac('sha256', secret).update('yamzz-admin').digest('hex') : '';
}
function adminOk(req){
  const got=getCookie(req,'yamzz_admin');
  const expected=adminToken();
  return !!expected && got===expected;
}

module.exports={sql,initDb,makeKey,durationMs,cookie,clearCookie,getCookie,json,requireUser,adminOk,adminToken};
