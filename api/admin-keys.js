const { initDb, sql, makeKey, durationMs, adminOk, json } = require("./_db");

module.exports = async (req,res) => {
  if (!adminOk(req)) return json(res,401,{success:false,message:"Admin belum login."});

  try {
    await initDb();

    if (req.method === "GET") {
      const r = await sql`
        SELECT id,key_value,plan,expires_at,created_at,active
        FROM inbox_keys
        ORDER BY created_at DESC
        LIMIT 500
      `;
      return json(res,200,{success:true,keys:r.rows});
    }

    if (req.method === "POST") {
      const body=req.body||{};
      const plan=body.plan==="paid" ? "paid" : "free";
      const amount=Number(body.duration);
      const unit=String(body.unit||"day");
      const expires=new Date(Date.now()+durationMs(amount,unit));
      const key=makeKey(plan==="paid" ? "PAID" : "FREE");

      await sql`
        INSERT INTO inbox_keys(key_value,plan,expires_at)
        VALUES(${key},${plan},${expires.toISOString()})
      `;

      return json(res,200,{
        success:true,key,plan,expires_at:expires.toISOString()
      });
    }

    if (req.method === "PATCH") {
      const body=req.body||{};
      const id=Number(body.id);
      if (!id) return json(res,400,{success:false,message:"ID tidak valid."});

      if (body.action==="disable") {
        await sql`UPDATE inbox_keys SET active=FALSE WHERE id=${id}`;
      } else if (body.action==="enable") {
        await sql`UPDATE inbox_keys SET active=TRUE WHERE id=${id}`;
      } else if (body.action==="extend") {
        const amount=Number(body.duration);
        const unit=String(body.unit||"day");
        const r=await sql`SELECT expires_at FROM inbox_keys WHERE id=${id}`;
        if (!r.rows[0]) return json(res,404,{success:false,message:"Key tidak ditemukan."});
        const base=Math.max(Date.now(),new Date(r.rows[0].expires_at).getTime());
        const expires=new Date(base+durationMs(amount,unit));
        await sql`UPDATE inbox_keys SET expires_at=${expires.toISOString()} WHERE id=${id}`;
      } else {
        return json(res,400,{success:false,message:"Action tidak dikenal."});
      }

      return json(res,200,{success:true});
    }

    return json(res,405,{success:false,message:"Method not allowed"});
  } catch (error) {
    console.error("admin-keys:",error);
    return json(res,500,{
      success:false,
      code:"ADMIN_KEYS_ERROR",
      message:"Operasi key gagal.",
      error:error.message
    });
  }
};
