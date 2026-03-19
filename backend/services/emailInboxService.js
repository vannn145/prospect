const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

function buildHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function buildPreview(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return '';
  }

  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function getAddressText(addressObject) {
  return addressObject?.text || '';
}

function getEmailConfig() {
  const fromEmail = process.env.OUTREACH_FROM_EMAIL || 'contato@impulsestrategy.com.br';
  const smtpUser = process.env.OUTREACH_SMTP_USER || fromEmail;
  const smtpPass = process.env.OUTREACH_SMTP_PASS || '';
  const imapHost = process.env.OUTREACH_IMAP_HOST || 'imap.hostinger.com';
  const imapPort = Number(process.env.OUTREACH_IMAP_PORT || 993);
  const imapSecure = parseBoolean(process.env.OUTREACH_IMAP_SECURE, imapPort === 993);
  const imapUser = process.env.OUTREACH_IMAP_USER || smtpUser;
  const imapPass = process.env.OUTREACH_IMAP_PASS || smtpPass;

  return {
    fromEmail,
    smtpConfigured: Boolean(smtpUser && smtpPass),
    smtpUserConfigured: Boolean(smtpUser),
    smtpPassConfigured: Boolean(smtpPass),
    imapConfigured: Boolean(imapHost && imapPort && imapUser && imapPass),
    imapHost,
    imapPort,
    imapSecure,
    imapUser,
    imapPass,
  };
}

function ensureImapConfigured() {
  const config = getEmailConfig();

  if (config.imapConfigured) {
    return config;
  }

  const missing = [];

  if (!config.imapUser) {
    missing.push('OUTREACH_IMAP_USER');
  }

  if (!config.imapPass) {
    missing.push('OUTREACH_IMAP_PASS ou OUTREACH_SMTP_PASS');
  }

  throw buildHttpError(`Inbox de e-mail não configurada. Preencha: ${missing.join(', ')}`, 400);
}

function createImapClient(config) {
  return new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecure,
    auth: {
      user: config.imapUser,
      pass: config.imapPass,
    },
    logger: false,
  });
}

async function withImapClient(callback) {
  const config = ensureImapConfigured();
  const client = createImapClient(config);

  await client.connect();

  try {
    return await callback(client, config);
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
  }
}

async function streamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function downloadParsedMessage(client, uid) {
  const download = await client.download(uid, undefined, { uid: true });
  const rawBuffer = await streamToBuffer(download.content);
  return simpleParser(rawBuffer);
}

function normalizeParsedMessage(uid, meta, parsed) {
  const textBody = String(parsed.text || stripHtml(parsed.html) || '').trim();
  const flags = Array.from(meta.flags || []);
  const seen = flags.includes('\\Seen');

  return {
    uid: Number(uid),
    subject: parsed.subject || meta.envelope?.subject || '(sem assunto)',
    from: getAddressText(parsed.from) || getAddressText(meta.envelope?.from) || '',
    to: getAddressText(parsed.to) || getAddressText(meta.envelope?.to) || '',
    date: parsed.date ? parsed.date.toISOString() : meta.internalDate ? meta.internalDate.toISOString() : null,
    preview: buildPreview(textBody),
    text: textBody,
    html: parsed.html ? String(parsed.html) : '',
    seen,
    flags,
    messageId: parsed.messageId || meta.envelope?.messageId || '',
  };
}

function matchesSearch(message, search) {
  if (!search) {
    return true;
  }

  const haystack = [message.subject, message.from, message.to, message.preview, message.text]
    .join(' ')
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

async function getInboxSummary() {
  return withImapClient(async (client) => {
    const status = await client.status('INBOX', { messages: true, unseen: true });

    return {
      mailbox: 'INBOX',
      totalMessages: Number(status.messages || 0),
      unreadCount: Number(status.unseen || 0),
    };
  });
}

async function listInboxMessages({ limit = 25, search = '' } = {}) {
  return withImapClient(async (client) => {
    const mailbox = await client.mailboxOpen('INBOX');
    const totalMessages = Number(mailbox.exists || 0);
    const normalizedLimit = Math.max(1, Math.min(Number(limit || 25), 50));
    const rangeStart = Math.max(1, totalMessages - normalizedLimit + 1);

    const metas = [];

    for await (const meta of client.fetch(`${rangeStart}:*`, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
    })) {
      metas.push(meta);
    }

    metas.reverse();

    const messages = [];

    for (const meta of metas) {
      const parsed = await downloadParsedMessage(client, meta.uid);
      const normalized = normalizeParsedMessage(meta.uid, meta, parsed);

      if (matchesSearch(normalized, search)) {
        messages.push({
          uid: normalized.uid,
          subject: normalized.subject,
          from: normalized.from,
          date: normalized.date,
          preview: normalized.preview,
          seen: normalized.seen,
          messageId: normalized.messageId,
        });
      }
    }

    return {
      mailbox: 'INBOX',
      totalMessages,
      unreadCount: Number(mailbox.unseen || 0),
      messages,
    };
  });
}

async function getInboxMessage(uid) {
  const parsedUid = Number(uid);

  if (!parsedUid) {
    throw buildHttpError('UID inválido.', 400);
  }

  return withImapClient(async (client) => {
    await client.mailboxOpen('INBOX');

    const meta = await client.fetchOne(parsedUid, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
    }, { uid: true });

    if (!meta) {
      throw buildHttpError('E-mail não encontrado.', 404);
    }

    const parsed = await downloadParsedMessage(client, parsedUid);
    return normalizeParsedMessage(parsedUid, meta, parsed);
  });
}

module.exports = {
  getEmailConfig,
  getInboxSummary,
  listInboxMessages,
  getInboxMessage,
};