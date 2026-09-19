const { initDb, sql, makeKey, durationMs, adminOk, json } = require('./_db');
module.exports=async(req,res)=>{
  if(!adminOk(req)) return json(res,401,{success:false,message:'Admin belum login'});
  try{
    await initDb();
    if(req.method==='GET'){
      const r=await sql`SELECT id,key_value,plan,expires_at,created_at,active FROM inbox_keys ORDER BY created_at DESC LIMIT 500`;
      return json(res,200,{success:true,keys:r.rows});
    }
    if(req.method==='POST'){
      const b=req.body||{}; const plan=b.plan==='paid'?'paid':'free';
      const amount=Number(b.duration); const unit=String(b.unit||'day');
      const expires=new Date(Date.now()+durationMs(amount,unit));
      const key=makeKey(plan==='paid'?'PAID':'FREE');
      await sql`INSERT INTO inbox_keys(key_value,plan,expires_at) VALUES(${key},${plan},${expires.toISOString()})`;
      return json(res,200,{success:true,key,plan,expires_at:expires.toISOString()});
    }
    if(req.method==='PATCH'){
      const b=req.body||{}; const id=Number(b.id);
      if(!id) return json(res,400,{success:false,message:'ID tidak valid'});
      if(b.action==='disable') await sql`UPDATE inbox_keys SET active=FALSE WHERE id=${id}`;
      else if(b.action==='enable') await sql`UPDATE inbox_keys SET active=TRUE WHERE id=${id}`;
      else if(b.action==='extend'){
        const amount=Number(b.duration), unit=String(b.unit||'day');
        const r=await sql`SELECT expires_at FROM inbox_keys WHERE id=${id}`; if(!r.rows[0]) return json(res,404,{success:false,message:'Key tidak ditemukan'});
        const base=Math.max(Date.now(),new Date(r.rows[0].expires_at).getTime());
        const expires=new Date(base+durationMs(amount,unit)); await sql`UPDATE inbox_keys SET expires_at=${expires.toISOString()} WHERE id=${id}`;
      }
      return json(res,200,{success:true});
    }
    return json(res,405,{success:false,message:'Method not allowed'});
  }catch(e){return json(res,500,{success:false,message:'Database error',error:e.message});}
};
