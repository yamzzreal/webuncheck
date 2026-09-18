const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { requireUser, json } = require("./_db.js");

function safeDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return json(res, 405, { success:false, message:"Method not allowed" });
  }

  try {
    const account = await requireUser(req, res);
    if (!account) return;

    const host = process.env.IMAP_HOST || "imap.gmail.com";
    const port = Number(process.env.IMAP_PORT || 993);
    const user = process.env.IMAP_USER;
    const pass = process.env.IMAP_PASS;

    if (!user || !pass) {
      return json(res, 500, {
        success:false,
        code:"IMAP_NOT_CONFIGURED",
        message:"IMAP belum dikonfigurasi. Isi IMAP_USER dan IMAP_PASS di Vercel."
      });
    }

    const requestedLimit = Number(req.query?.limit || 50);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 100);

    const client = new ImapFlow({
      host,
      port,
      secure: port === 993,
      auth: { user, pass },
      logger: false,
      socketTimeout: 15000,
      greetingTimeout: 10000,
      connectionTimeout: 15000
    });

    let lock;
    try {
      await client.connect();
      lock = await client.getMailboxLock("INBOX");

      const status = await client.status("INBOX", { messages:true });
      const total = Number(status.messages || 0);
      const start = Math.max(1, total - limit + 1);
      const messages = [];

      if (total > 0) {
        for await (const msg of client.fetch(`${start}:*`, {
          uid:true,
          envelope:true,
          source:true,
          flags:true
        })) {
          let parsed;
          try {
            parsed = await simpleParser(msg.source);
          } catch (_) {
            parsed = null;
          }

          const from = parsed?.from?.value?.[0] || msg.envelope?.from?.[0] || {};
          const to = parsed?.to?.value || msg.envelope?.to || [];
          const text = typeof parsed?.text === "string" ? parsed.text : "";
          const html = typeof parsed?.html === "string" ? parsed.html : "";

          messages.push({
            uid: msg.uid,
            from: {
              name: from.name || "",
              email: from.address || ""
            },
            to: to.map(x => ({
              name:x.name || "",
              email:x.address || ""
            })),
            subject: parsed?.subject || msg.envelope?.subject || "(Tanpa subject)",
            date: safeDate(parsed?.date || msg.envelope?.date),
            text: text.slice(0, 20000),
            html: html.slice(0, 30000),
            snippet: text.replace(/\s+/g, " ").trim().slice(0, 180),
            seen: Boolean(msg.flags?.has("\\Seen")),
            attachments: (parsed?.attachments || []).map(a => ({
              filename:a.filename || "attachment",
              contentType:a.contentType || "application/octet-stream",
              size:Number(a.size || 0)
            }))
          });
        }
      }

      messages.sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));

      return json(res, 200, {
        success:true,
        count:messages.length,
        account:user,
        plan:account.plan,
        expires_at:account.expires_at,
        messages
      });
    } finally {
      try { lock?.release(); } catch (_) {}
      try { await client.logout(); } catch (_) {}
    }
  } catch (error) {
    console.error("messages:", error);
    return json(res, 500, {
      success:false,
      code:"INBOX_ERROR",
      message:"Gagal membaca inbox.",
      error:error.message
    });
  }
};
