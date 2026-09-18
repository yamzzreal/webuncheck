const { cookie, json, adminToken } = require("./_db");

module.exports = async (req,res) => {
  if (req.method !== "POST") return json(res,405,{success:false,message:"Method not allowed"});
  try {
    const password = process.env.ADMIN_PASSWORD || "";
    if (!password) return json(res,500,{success:false,message:"ADMIN_PASSWORD belum diatur di Vercel."});
    if (String(req.body?.password || "") !== password) {
      return json(res,401,{success:false,message:"Password admin salah."});
    }
    cookie(res,"yamzz_admin",adminToken(),86400*7);
    return json(res,200,{success:true});
  } catch (error) {
    return json(res,500,{success:false,message:"Admin login gagal.",error:error.message});
  }
};
