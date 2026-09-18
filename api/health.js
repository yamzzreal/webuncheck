module.exports = async (req,res) => {
  res.status(200).json({
    success:true,
    service:"Yamzz Email Inbox",
    configured:Boolean(process.env.IMAP_USER && process.env.IMAP_PASS),
    time:new Date().toISOString()
  });
};