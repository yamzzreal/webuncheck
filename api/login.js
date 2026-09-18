const { initDb, sql, cookie, json } = require("./_db");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { success:false, message:"Method not allowed" });
  }

  try {
    await initDb();

    const key = String(req.body?.key || "").trim();
    if (!key) return json(res, 400, { success:false, message:"Access key wajib diisi." });

    const result = await sql`
      SELECT id,key_value,plan,expires_at,active
      FROM inbox_keys
      WHERE key_value=${key}
      LIMIT 1
    `;
    const row = result.rows[0];

    if (!row || !row.active) {
      return json(res, 401, { success:false, message:"Access key tidak valid." });
    }

    const expires = new Date(row.expires_at).getTime();
    if (!Number.isFinite(expires) || expires <= Date.now()) {
      return json(res, 401, { success:false, message:"Access key sudah expired." });
    }

    cookie(res, "yamzz_inbox_key", row.key_value, Math.floor((expires-Date.now())/1000));

    return json(res, 200, {
      success:true,
      plan:row.plan,
      expires_at:row.expires_at
    });
  } catch (error) {
    console.error("login:", error);
    return json(res, 500, {
      success:false,
      code:"LOGIN_ERROR",
      message:"Login gagal karena database belum siap atau tidak dapat diakses.",
      error:error.message
    });
  }
};
