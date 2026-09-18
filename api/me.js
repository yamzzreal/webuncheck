const { requireUser, json } = require('./_db');
module.exports=async(req,res)=>{try{const user=await requireUser(req,res);if(!user)return;return json(res,200,{success:true,user:{plan:user.plan,expires_at:user.expires_at}})}catch(e){return json(res,500,{success:false,message:e.message})}};
