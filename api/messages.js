const { ImapFlow } = require("imapflow");
const { requireUser } = require("./_db");

function send(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
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

  if (!user || !pass) {
    return send(res, 500, {
      success: false,
      message: "IMAP_USER atau IMAP_PASS belum diatur."
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

    // Ambil semua folder/mailbox
    const mailboxes = await client.list();

    const folders = mailboxes.map(box => ({
      path: box.path,
      name: box.name,
      specialUse: box.specialUse || null
    }));

    // Cari folder Spam
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
      try {
        await client.logout();
      } catch (_) {}

      return send(res, 404, {
        success: false,
        message: "Folder Spam tidak ditemukan.",
        folders
      });
    }

    const spamPath = spam.path;

    const lock = await client.getMailboxLock(spamPath);

    try {
      const status = await client.status(spamPath, {
        messages: true,
        unseen: true
      });

      const total = Number(status.messages || 0);
      const unseen = Number(status.unseen || 0);

      lock.release();

      try {
        await client.logout();
      } catch (_) {}

      return send(res, 200, {
        success: true,
        message: "Folder Spam berhasil ditemukan.",
        account: user,
        mailbox: spamPath,
        folder: "spam",
        total,
        unseen,
        plan: userAccount.plan,
        expires_at: userAccount.expires_at,
        folders
      });
    } catch (error) {
      try {
        lock.release();
      } catch (_) {}

      throw error;
    }
  } catch (error) {
    try {
      await client.logout();
    } catch (_) {}

    console.error("IMAP ERROR:", error);

    return send(res, 500, {
      success: false,
      message: "Gagal membaca inbox Spam",
      error: error?.message || String(error),
      code: error?.code || null
    });
  }
};
