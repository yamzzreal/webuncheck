const { clearCookie, json } = require("./_db");
module.exports=async(req,res)=>{
  clearCookie(res,"yamzz_inbox_key");
  clearCookie(res,"yamzz_admin");
  return json(res,200,{success:true});
};
