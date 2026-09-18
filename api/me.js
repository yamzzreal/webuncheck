const { requireUser, json } = require("./_db");

module.exports = async (req,res) => {
  if (req.method !== "GET") return json(res,405,{success:false,message:"Method not allowed"});
  try {
    const user = await requireUser(req,res);
    if (!user) return;
    return json(res,200,{
      success:true,
      user:{ plan:user.plan, expires_at:user.expires_at }
    });
  } catch (error) {
    return json(res,500,{success:false,message:"Gagal memeriksa sesi.",error:error.message});
  }
};
