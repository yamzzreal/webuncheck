const { dbConfigured, json } = require("./_db");
module.exports=async(req,res)=>{
  return json(res,200,{
    success:true,
    service:"Yamzz Mail Inbox",
    imap_configured:Boolean(process.env.IMAP_USER && process.env.IMAP_PASS),
    database_configured:dbConfigured(),
    time:new Date().toISOString()
  });
};
