const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

const { getLatestEmailSendReport } = require('./emailCampaignService');

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

function parseAddressEmails(value) {
  return String(value || '')
    .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.map((item) => item.toLowerCase()) || [];
}

function parseStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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
  const smtpHost = process.env.OUTREACH_SMTP_HOST || 'smtp.hostinger.com';
  const smtpPort = Number(process.env.OUTREACH_SMTP_PORT || 465);
  const smtpSecure = parseBoolean(process.env.OUTREACH_SMTP_SECURE, smtpPort === 465);
  const smtpUser = process.env.OUTREACH_SMTP_USER || fromEmail;
  const smtpPass = process.env.OUTREACH_SMTP_PASS || '';
  const replyTo = process.env.OUTREACH_EMAIL_REPLY_TO || '';
  const imapHost = process.env.OUTREACH_IMAP_HOST || 'imap.hostinger.com';
  const imapPort = Number(process.env.OUTREACH_IMAP_PORT || 993);
  const imapSecure = parseBoolean(process.env.OUTREACH_IMAP_SECURE, imapPort === 993);
  const imapUser = process.env.OUTREACH_IMAP_USER || smtpUser;
  const imapPass = process.env.OUTREACH_IMAP_PASS || smtpPass;

  return {
    fromEmail,
    smtpHost,
    smtpPort,
    smtpSecure,
    replyTo,
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

function ensureSmtpConfigured() {
  const config = getEmailConfig();

  if (config.smtpConfigured && config.smtpHost) {
    return config;
  }

  const missing = [];

  if (!config.smtpHost) {
    missing.push('OUTREACH_SMTP_HOST');
  }

  if (!config.smtpUser) {
    missing.push('OUTREACH_SMTP_USER');
  }

  if (!config.smtpPass) {
    missing.push('OUTREACH_SMTP_PASS');
  }

  throw buildHttpError(`SMTP não configurado. Preencha: ${missing.join(', ')}`, 400);
}

function buildProspectionKeywords() {
  return parseStringArray(process.env.OUTREACH_PROSPECTION_KEYWORDS || [
    'prospec',
    'prospecção',
    'proposta',
    'parceria',
    'comercial',
    'orçamento',
    'reunião',
    'demo',
    'apresentação comercial',
    'diagnóstico gratuito',
    'chamada comercial',
    'follow up',
  ]);
}

function buildIgnoredInboxKeywords() {
  return parseStringArray(process.env.OUTREACH_IGNORE_INBOX_KEYWORDS || [
    'newsletter',
    'descadastre',
    'unsubscribe',
    'black friday',
    'cupom',
    'promoção',
    'oferta',
    'google alerts',
    'notificação linkedin',
    'no-reply',
    'noreply',
    'do-not-reply',
  ]);
}

function getProspectionContext() {
  const report = getLatestEmailSendReport(1200);
  const emailSet = new Set();
  const domainSet = new Set();

  for (const item of report?.items || []) {
    for (const email of parseAddressEmails(item.to_email)) {
      emailSet.add(email);
      const [, domain] = email.split('@');
      if (domain) {
        domainSet.add(domain);
      }
    }
  }

  return {
    report,
    knownEmails: emailSet,
    knownDomains: domainSet,
    includeKeywords: buildProspectionKeywords().map((item) => item.toLowerCase()),
    ignoreKeywords: buildIgnoredInboxKeywords().map((item) => item.toLowerCase()),
  };
}

function extractEmailDomain(email) {
  const [, domain] = String(email || '').toLowerCase().split('@');
  return domain || '';
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

function isProspectionRelatedMessage(message, context) {
  const allContent = [message.subject, message.from, message.to, message.preview, message.text]
    .join(' ')
    .toLowerCase();

  if (context.ignoreKeywords.some((keyword) => keyword && allContent.includes(keyword))) {
    return false;
  }

  const addresses = [
    ...parseAddressEmails(message.from),
    ...parseAddressEmails(message.to),
  ];

  for (const email of addresses) {
    if (context.knownEmails.has(email)) {
      return true;
    }

    const domain = extractEmailDomain(email);
    if (domain && context.knownDomains.has(domain)) {
      return true;
    }
  }

  return context.includeKeywords.some((keyword) => keyword && allContent.includes(keyword));
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

async function listInboxMessages({ limit = 25, search = '', prospectionOnly = true } = {}) {
  return withImapClient(async (client) => {
    const mailbox = await client.mailboxOpen('INBOX');
    const totalMessages = Number(mailbox.exists || 0);
    const normalizedLimit = Math.max(1, Math.min(Number(limit || 25), 50));
    const rangeStart = Math.max(1, totalMessages - normalizedLimit + 1);
    const context = prospectionOnly ? getProspectionContext() : null;

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

      if (prospectionOnly && !isProspectionRelatedMessage(normalized, context)) {
        continue;
      }

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

async function sendEmailFromPanel({ to, subject, text, html }) {
  const config = ensureSmtpConfigured();
  const normalizedTo = parseAddressEmails(to)[0] || '';
  const normalizedSubject = String(subject || '').trim();
  const normalizedText = String(text || '').trim();
  const normalizedHtml = String(html || '').trim();

  if (!normalizedTo) {
    throw buildHttpError('Informe um e-mail de destino válido.', 400);
  }

  if (!normalizedSubject) {
    throw buildHttpError('Informe o assunto do e-mail.', 400);
  }

  if (!normalizedText && !normalizedHtml) {
    throw buildHttpError('Informe o corpo do e-mail.', 400);
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  const result = await transporter.sendMail({
    from: config.fromEmail,
    to: normalizedTo,
    subject: normalizedSubject,
    ...(normalizedText ? { text: normalizedText } : {}),
    ...(normalizedHtml ? { html: normalizedHtml } : {}),
    ...(config.replyTo ? { replyTo: config.replyTo } : {}),
  });

  return {
    to: normalizedTo,
    subject: normalizedSubject,
    messageId: result.messageId || null,
  };
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
  sendEmailFromPanel,
};