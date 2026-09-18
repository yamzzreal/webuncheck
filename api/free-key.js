const { initDb, sql, makeKey, durationMs, json } = require("./_db");

module.exports = async (req,res) => {
  if (req.method !== "POST") return json(res,405,{success:false,message:"Method not allowed"});

  try {
    if (String(process.env.FREE_KEY_PUBLIC || "true").toLowerCase() !== "true") {
      return json(res,403,{success:false,message:"Pembuatan key free sedang dinonaktifkan admin."});
    }

    await initDb();

    const duration=Number(process.env.FREE_KEY_DURATION||1);
    const unit=String(process.env.FREE_KEY_UNIT||"day");
    const expires=new Date(Date.now()+durationMs(duration,unit));
    const key=makeKey("FREE");

    await sql`
      INSERT INTO inbox_keys(key_value,plan,expires_at)
      VALUES(${key},'free',${expires.toISOString()})
    `;

    return json(res,200,{
      success:true,key,plan:"free",duration,unit,expires_at:expires.toISOString()
    });
  } catch(error) {
    console.error("free-key:",error);
    return json(res,500,{
      success:false,
      code:"FREE_KEY_ERROR",
      message:"Gagal membuat key free.",
      error:error.message
    });
  }
};
