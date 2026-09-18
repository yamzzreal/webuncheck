const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { requireUser, json: dbJson } = require('./_db');

function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function safeDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return send(res, 405, { success:false, message:"Method not allowed" });

  const userAccount = await requireUser(req,res);
  if (!userAccount) return;

  const host = process.env.IMAP_HOST || "imap.gmail.com";
  const port = Number(process.env.IMAP_PORT || 993);
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);

  if (!user || !pass) {
    return send(res, 500, {
      success:false,
      message:"IMAP belum dikonfigurasi. Isi IMAP_USER dan IMAP_PASS di Vercel."
    });
  }

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass },
    logger: false
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const messages = [];

    try {
      const status = await client.status("INBOX", { messages:true, unseen:true });
      const start = Math.max(1, (status.messages || 0) - limit + 1);

      for await (const msg of client.fetch(`${start}:*`, {
        uid: true,
        envelope: true,
        source: true,
        flags: true
      })) {
        let parsed = null;
        try { parsed = await simpleParser(msg.source); } catch (_) {}

        const from = parsed?.from?.value?.[0] || msg.envelope?.from?.[0] || {};
        const to = parsed?.to?.value || msg.envelope?.to || [];
        const text = parsed?.text || "";
        const html = parsed?.html || "";

        messages.push({
          uid: msg.uid,
          from: {
            name: from.name || "",
            email: from.address || ""
          },
          to: to.map(x => ({ name:x.name || "", email:x.address || "" })),
          subject: parsed?.subject || msg.envelope?.subject || "(Tanpa subject)",
          date: safeDate(parsed?.date || msg.envelope?.date),
          text: text.slice(0, 20000),
          html: typeof html === "string" ? html.slice(0, 30000) : "",
          snippet: text.replace(/\s+/g, " ").trim().slice(0, 180),
          seen: Boolean(msg.flags?.has("\\Seen")),
          attachments: (parsed?.attachments || []).map(a => ({
            filename:a.filename || "attachment",
            contentType:a.contentType || "application/octet-stream",
            size:a.size || 0
          }))
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
    messages.sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));

    return send(res, 200, {
      success:true,
      count:messages.length,
      account:user,
      plan:userAccount.plan,
      expires_at:userAccount.expires_at,
      messages
    });
  } catch (error) {
    try { await client.logout(); } catch (_) {}
    return send(res, 500, {
      success:false,
      message:"Gagal membaca inbox",
      error:error.message
    });
  }
};