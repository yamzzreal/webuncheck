const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { requireUser } = require("./_db");

function send(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.end(JSON.stringify(body));
}

function safeDate(value) {
  if (!value) return null;

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? null
    : d.toISOString();
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return send(res, 405, {
      success: false,
      message: "Method not allowed"
    });
  }

  const userAccount = await requireUser(req, res);

  if (!userAccount) return;

  const host = process.env.IMAP_HOST || "imap.gmail.com";
  const port = Number(process.env.IMAP_PORT || 993);
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  const limit = Math.min(
    Math.max(Number(req.query.limit || 50), 1),
    100
  );

  if (!user || !pass) {
    return send(res, 500, {
      success: false,
      message: "IMAP_USER dan IMAP_PASS belum dikonfigurasi."
    });
  }

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: {
      user,
      pass
    },
    logger: false,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
  });

  try {
    await client.connect();

    // =====================================
    // CARI FOLDER SPAM
    // =====================================

    const mailboxes = await client.list();

    let spam = mailboxes.find(
      box =>
        String(box.specialUse || "").toLowerCase() === "\\junk"
    );

    if (!spam) {
      spam = mailboxes.find(box => {
        const path = String(box.path || "").toLowerCase();

        return (
          path === "[gmail]/spam" ||
          path === "spam" ||
          path === "junk" ||
          path.includes("/spam") ||
          path.includes("/junk")
        );
      });
    }

    if (!spam) {
      await client.logout();

      return send(res, 404, {
        success: false,
        message: "Folder Spam/Junk tidak ditemukan.",
        folders: mailboxes.map(box => ({
          path: box.path,
          name: box.name,
          specialUse: box.specialUse || null
        }))
      });
    }

    const spamPath = spam.path;

    // =====================================
    // BUKA FOLDER SPAM
    // =====================================

    const lock = await client.getMailboxLock(spamPath);

    try {
      const mailbox = client.mailbox;

      const total = Number(mailbox.exists || 0);

      // Tidak ada email
      if (total === 0) {
        return send(res, 200, {
          success: true,
          folder: "spam",
          mailbox: spamPath,
          account: user,
          total: 0,
          count: 0,
          unseen: 0,
          messages: []
        });
      }

      // =====================================
      // TENTUKAN RANGE
      // =====================================

      const start = Math.max(
        1,
        total - limit + 1
      );

      const messages = [];

      // =====================================
      // AMBIL EMAIL SPAM
      // =====================================

      for await (
        const msg of client.fetch(
          `${start}:*`,
          {
            uid: true,
            envelope: true,
            source: true,
            flags: true,
            internalDate: true
          }
        )
      ) {
        let parsed = null;

        try {
          parsed = await simpleParser(msg.source);
        } catch (error) {
          console.error(
            "Parser error:",
            error.message
          );
        }

        const envelopeFrom =
          msg.envelope?.from?.[0] || {};

        const parsedFrom =
          parsed?.from?.value?.[0] || {};

        const from =
          parsedFrom.address ||
          envelopeFrom.address
            ? {
                name:
                  parsedFrom.name ||
                  envelopeFrom.name ||
                  "",
                email:
                  parsedFrom.address ||
                  envelopeFrom.address ||
                  ""
              }
            : {
                name: "",
                email: ""
              };

        const to =
          parsed?.to?.value ||
          msg.envelope?.to ||
          [];

        const text =
          typeof parsed?.text === "string"
            ? parsed.text
            : "";

        const html =
          typeof parsed?.html === "string"
            ? parsed.html
            : "";

        const subject =
          parsed?.subject ||
          msg.envelope?.subject ||
          "(Tanpa subject)";

        const date =
          safeDate(parsed?.date) ||
          safeDate(msg.envelope?.date) ||
          safeDate(msg.internalDate);

        const seen =
          msg.flags &&
          typeof msg.flags.has === "function"
            ? msg.flags.has("\\Seen")
            : false;

        messages.push({
          uid: msg.uid,

          from,

          to: Array.isArray(to)
            ? to.map(item => ({
                name: item.name || "",
                email: item.address || ""
              }))
            : [],

          subject,

          date,

          text: text.slice(0, 20000),

          html: html.slice(0, 30000),

          snippet: text
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 180),

          seen: Boolean(seen),

          unread: !seen,

          spam: true,

          mailbox: spamPath,

          attachments:
            Array.isArray(parsed?.attachments)
              ? parsed.attachments.map(
                  attachment => ({
                    filename:
                      attachment.filename ||
                      "attachment",

                    contentType:
                      attachment.contentType ||
                      "application/octet-stream",

                    size:
                      Number(
                        attachment.size || 0
                      )
                  })
                )
              : []
        });
      }

      // =====================================
      // URUTKAN EMAIL TERBARU
      // =====================================

      messages.sort(
        (a, b) =>
          new Date(b.date || 0) -
          new Date(a.date || 0)
      );

      const unseen =
        messages.filter(
          message => message.unread
        ).length;

      return send(res, 200, {
        success: true,

        folder: "spam",

        mailbox: spamPath,

        account: user,

        total,

        count: messages.length,

        unseen,

        plan: userAccount.plan,

        expires_at:
          userAccount.expires_at,

        messages
      });
    } finally {
      lock.release();
    }
  } catch (error) {
    console.error(
      "SPAM IMAP ERROR:",
      error
    );

    return send(res, 500, {
      success: false,

      message:
        "Gagal membaca inbox Spam",

      error:
        error?.message ||
        String(error),

      code:
        error?.code ||
        null
    });
  } finally {
    try {
      await client.logout();
    } catch (_) {}
  }
};
