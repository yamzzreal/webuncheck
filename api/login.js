const { initDb, sql, cookie, clearCookie, json } = require('./_db');
module.exports = async (req,res)=>{
  if(req.method!=='POST') return json(res,405,{success:false,message:'Method not allowed'});
  try{
    await initDb();
    const {key}=req.body||{};
    if(!key) return json(res,400,{success:false,message:'Key wajib diisi'});
    const r=await sql`SELECT id,key_value,plan,expires_at FROM inbox_keys WHERE key_value=${String(key).trim()} AND active=TRUE LIMIT 1`;
    const row=r.rows[0];
    if(!row) return json(res,401,{success:false,message:'Key tidak valid'});
    if(new Date(row.expires_at).getTime()<=Date.now()) return json(res,401,{success:false,message:'Key sudah expired'});
    cookie(res,'yamzz_inbox_key',row.key_value,Math.max(60,Math.floor((new Date(row.expires_at).getTime()-Date.now())/1000)));
    return json(res,200,{success:true,plan:row.plan,expires_at:row.expires_at});
  }catch(e){return json(res,500,{success:false,message:'Database error',error:e.message});}
};
