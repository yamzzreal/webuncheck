const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { requireUser } = require("./_db");

function send(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.end(JSON.stringify(body));
}

function safeDate(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function cleanText(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function normalizeAddress(address) {
  return {
    name: address?.name || "",
    email: address?.address || ""
  };
}

function normalizeAddresses(addresses) {
  if (!Array.isArray(addresses)) return [];

  return addresses.map(normalizeAddress);
}

async function findSpamMailbox(client) {
  const mailboxes = await client.list();

  // Prioritas utama: special-use Gmail/IMAP
  const bySpecialUse = mailboxes.find(
    mailbox =>
      typeof mailbox.specialUse === "string" &&
      mailbox.specialUse.toLowerCase() === "\\junk"
  );

  if (bySpecialUse) {
    return bySpecialUse;
  }

  // Fallback berdasarkan nama/path folder
  const spamNames = [
    "[Gmail]/Spam",
    "[Gmail]/spam",
    "Spam",
    "spam",
    "Junk",
    "junk",
    "Junk E-mail",
    "Junk Mail",
    "Bulk Mail"
  ];

  for (const name of spamNames) {
    const mailbox = mailboxes.find(
      box =>
        typeof box.path === "string" &&
        box.path.toLowerCase() === name.toLowerCase()
    );

    if (mailbox) {
      return mailbox;
    }
  }

  // Fallback pencarian nama mengandung spam/junk
  const byName = mailboxes.find(mailbox => {
    const path = String(mailbox.path || "").toLowerCase();

    return (
      path.includes("spam") ||
      path.includes("junk")
    );
  });

  return byName || null;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return send(res, 405, {
      success: false,
      message: "Method not allowed"
    });
  }

  // ==============================
  // AUTH USER
  // ==============================

  const userAccount = await requireUser(req, res);

  if (!userAccount) {
    return;
  }

  // ==============================
  // IMAP CONFIG
  // ==============================

  const host = process.env.IMAP_HOST || "imap.gmail.com";
  const port = Number(process.env.IMAP_PORT || 993);

  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  // Maksimal 100 email
  const limit = Math.min(
    Math.max(
      Number(req.query.limit || 50),
      1
    ),
    100
  );

  if (!user || !pass) {
    return send(res, 500, {
      success: false,
      message:
        "IMAP belum dikonfigurasi. Isi IMAP_USER dan IMAP_PASS di Vercel."
    });
  }

  // ==============================
  // IMAP CLIENT
  // ==============================

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,

    auth: {
      user,
      pass
    },

    logger: false,

    // Timeout supaya function tidak menggantung terlalu lama
    socketTimeout: 30000,
    greetingTimeout: 30000,
    connectionTimeout: 30000
  });

  let lock = null;

  try {
    // ==============================
    // CONNECT
    // ==============================

    await client.connect();

    // ==============================
    // CARI FOLDER SPAM
    // ==============================

    const spamMailbox = await findSpamMailbox(client);

    if (!spamMailbox) {
      return send(res, 404, {
        success: false,
        message:
          "Folder Spam/Junk tidak ditemukan di akun email.",
        account: user
      });
    }

    const spamPath = spamMailbox.path;

    // ==============================
    // LOCK FOLDER SPAM
    // ==============================

    lock = await client.getMailboxLock(spamPath);

    const messages = [];

    try {
      // ==============================
      // STATUS SPAM
      // ==============================

      const status = await client.status(spamPath, {
        messages: true,
        unseen: true
      });

      const totalMessages = Number(status.messages || 0);

      // Tidak ada email
      if (totalMessages === 0) {
        return send(res, 200, {
          success: true,
          count: 0,
          total: 0,
          unseen: Number(status.unseen || 0),
          account: user,
          mailbox: spamPath,
          folder: "spam",
          plan: userAccount.plan,
          expires_at: userAccount.expires_at,
          messages: []
        });
      }

      // ==============================
      // HITUNG RANGE EMAIL
      // ==============================

      const start = Math.max(
        1,
        totalMessages - limit + 1
      );

      const range = `${start}:*`;

      // ==============================
      // FETCH EMAIL SPAM
      // ==============================

      for await (
        const msg of client.fetch(
          range,
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
          if (msg.source) {
            parsed = await simpleParser(msg.source);
          }
        } catch (error) {
          parsed = null;
        }

        // ==============================
        // FROM
        // ==============================

        const parsedFrom =
          parsed?.from?.value?.[0];

        const envelopeFrom =
          msg.envelope?.from?.[0];

        const from =
          parsedFrom ||
          envelopeFrom ||
          {};

        // ==============================
        // TO
        // ==============================

        const parsedTo =
          parsed?.to?.value;

        const envelopeTo =
          msg.envelope?.to;

        const to =
          parsedTo ||
          envelopeTo ||
          [];

        // ==============================
        // SUBJECT
        // ==============================

        const subject =
          parsed?.subject ||
          msg.envelope?.subject ||
          "(Tanpa subject)";

        // ==============================
        // DATE
        // ==============================

        const date =
          safeDate(parsed?.date) ||
          safeDate(msg.envelope?.date) ||
          safeDate(msg.internalDate);

        // ==============================
        // TEXT
        // ==============================

        const text =
          typeof parsed?.text === "string"
            ? parsed.text
            : "";

        // ==============================
        // HTML
        // ==============================

        const html =
          typeof parsed?.html === "string"
            ? parsed.html
            : "";

        // ==============================
        // SNIPPET
        // ==============================

        const snippet = cleanText(text)
          .slice(0, 180);

        // ==============================
        // ATTACHMENTS
        // ==============================

        const attachments =
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
                    Number(attachment.size || 0)
                })
              )
            : [];

        // ==============================
        // FLAGS
        // ==============================

        const flags = msg.flags || new Set();

        const seen =
          typeof flags.has === "function"
            ? Boolean(flags.has("\\Seen"))
            : false;

        // ==============================
        // PUSH MESSAGE
        // ==============================

        messages.push({
          uid: msg.uid,

          from: normalizeAddress(from),

          to: normalizeAddresses(to),

          subject,

          date,

          text: text.slice(0, 20000),

          html: html.slice(0, 30000),

          snippet,

          seen,

          unread: !seen,

          spam: true,

          mailbox: spamPath,

          attachments
        });
      }
    } finally {
      // ==============================
      // RELEASE LOCK
      // ==============================

      if (lock) {
        lock.release();
        lock = null;
      }
    }

    // ==============================
    // SORT TERBARU
    // ==============================

    messages.sort(
      (a, b) =>
        new Date(b.date || 0) -
        new Date(a.date || 0)
    );

    // ==============================
    // LOGOUT
    // ==============================

    try {
      await client.logout();
    } catch (_) {}

    // ==============================
    // RESPONSE
    // ==============================

    return send(res, 200, {
      success: true,

      count: messages.length,

      total: Number(
        status.messages || messages.length
      ),

      unseen: Number(
        status.unseen || 0
      ),

      account: user,

      mailbox: spamPath,

      folder: "spam",

      plan: userAccount.plan,

      expires_at: userAccount.expires_at,

      messages
    });
  } catch (error) {
    // ==============================
    // RELEASE LOCK JIKA ERROR
    // ==============================

    try {
      if (lock) {
        lock.release();
        lock = null;
      }
    } catch (_) {}

    // ==============================
    // LOGOUT JIKA MASIH CONNECTED
    // ==============================

    try {
      await client.logout();
    } catch (_) {}

    console.error("IMAP SPAM ERROR:", error);

    return send(res, 500, {
      success: false,

      message: "Gagal membaca inbox Spam",

      error:
        error?.message ||
        "Unknown IMAP error"
    });
  }
};
