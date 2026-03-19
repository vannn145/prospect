const fs = require('fs');
const path = require('path');

const nodemailer = require('nodemailer');

require('dotenv').config();

const EXPORTS_DIR = path.join(__dirname, '..', 'exports');
const CSV_PREFIX = 'failed-whatsapp-email-campaign-';
const CSV_SUFFIX = '.csv';

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function csvEscape(value) {
  const normalized = String(value ?? '');
  return `"${normalized.replace(/"/g, '""')}"`;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      field = '';

      if (row.some((value) => String(value || '').trim() !== '')) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    if (char === '\r') {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);

    if (row.some((value) => String(value || '').trim() !== '')) {
      rows.push(row);
    }
  }

  if (!rows.length) {
    return [];
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => String(header || '').trim());

  return dataRows
    .map((dataRow) => {
      const mapped = {};

      headers.forEach((header, index) => {
        mapped[header] = dataRow[index] ?? '';
      });

      return mapped;
    })
    .filter((item) => String(item.to_email || '').trim() !== '');
}

function getCliValue(args, prefix) {
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function resolveCampaignCsvPath(args) {
  const customFile = getCliValue(args, '--file=');
  if (customFile) {
    return path.isAbsolute(customFile)
      ? customFile
      : path.resolve(process.cwd(), customFile);
  }

  if (!fs.existsSync(EXPORTS_DIR)) {
    throw new Error(`Pasta de exportação não encontrada: ${EXPORTS_DIR}`);
  }

  const candidates = fs
    .readdirSync(EXPORTS_DIR)
    .filter((name) => name.startsWith(CSV_PREFIX) && name.endsWith(CSV_SUFFIX))
    .map((name) => {
      const fullPath = path.join(EXPORTS_DIR, name);
      const stats = fs.statSync(fullPath);
      return {
        name,
        fullPath,
        mtimeMs: stats.mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (!candidates.length) {
    throw new Error('Nenhum CSV de campanha encontrado em backend/exports. Rode: npm run email:failed-campaign');
  }

  return candidates[0].fullPath;
}

function buildTransportConfig() {
  const fromEmail = process.env.OUTREACH_FROM_EMAIL || 'contato@impulsestrategy.com.br';
  const smtpHost = process.env.OUTREACH_SMTP_HOST || 'smtp.hostinger.com';
  const smtpPort = parseNumber(process.env.OUTREACH_SMTP_PORT || 465, 465);
  const smtpSecure = parseBoolean(process.env.OUTREACH_SMTP_SECURE, smtpPort === 465);
  const smtpUser = process.env.OUTREACH_SMTP_USER || fromEmail;
  const smtpPass = process.env.OUTREACH_SMTP_PASS || '';
  const replyTo = process.env.OUTREACH_EMAIL_REPLY_TO || '';

  return {
    fromEmail,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    replyTo,
  };
}

function buildReportPath() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  return path.join(EXPORTS_DIR, `email-send-report-${timestamp}.csv`);
}

function writeReport(reportPath, rows) {
  const headers = [
    'company_id',
    'company_name',
    'to_email',
    'status',
    'message_id',
    'error',
    'sent_at',
    'last_failed_code',
  ];

  const lines = [headers.map(csvEscape).join(',')];

  rows.forEach((row) => {
    lines.push([
      row.company_id,
      row.company_name,
      row.to_email,
      row.status,
      row.message_id,
      row.error,
      row.sent_at,
      row.last_failed_code,
    ].map(csvEscape).join(','));
  });

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  const campaignPath = resolveCampaignCsvPath(args);
  const csvContent = fs.readFileSync(campaignPath, 'utf8');
  const recipients = parseCsv(csvContent);

  if (!recipients.length) {
    throw new Error('CSV sem destinatários válidos em to_email.');
  }

  const transport = buildTransportConfig();

  const dryRunCli = args.includes('--dry-run');
  const dryRunEnv = parseBoolean(process.env.OUTREACH_EMAIL_SEND_DRY_RUN, false);
  const dryRun = dryRunCli || dryRunEnv;
  const delayMs = parseNumber(getCliValue(args, '--delay-ms='), parseNumber(process.env.OUTREACH_EMAIL_SEND_DELAY_MS, 1200));
  const maxFromEnv = parseNumber(process.env.OUTREACH_EMAIL_SEND_MAX, 0);
  const maxFromCli = parseNumber(getCliValue(args, '--max='), maxFromEnv);
  const maxToSend = maxFromCli > 0 ? Math.floor(maxFromCli) : 0;

  const selectedRecipients = maxToSend > 0
    ? recipients.slice(0, maxToSend)
    : recipients;

  const reportRows = [];
  let sent = 0;
  let failed = 0;

  let transporter = null;

  if (!dryRun) {
    if (!transport.smtpPass) {
      throw new Error('OUTREACH_SMTP_PASS não configurado no .env.');
    }

    transporter = nodemailer.createTransport({
      host: transport.smtpHost,
      port: transport.smtpPort,
      secure: transport.smtpSecure,
      auth: {
        user: transport.smtpUser,
        pass: transport.smtpPass,
      },
    });

    await transporter.verify();
  }

  for (let index = 0; index < selectedRecipients.length; index += 1) {
    const recipient = selectedRecipients[index];
    const toEmail = String(recipient.to_email || '').trim();

    if (!toEmail) {
      reportRows.push({
        ...recipient,
        status: 'skipped',
        message_id: '',
        error: 'to_email vazio',
        sent_at: '',
      });
      continue;
    }

    const message = {
      from: recipient.from_email || transport.fromEmail,
      to: toEmail,
      subject: recipient.subject || 'Proposta comercial',
      text: recipient.body || '',
      ...(transport.replyTo ? { replyTo: transport.replyTo } : {}),
    };

    try {
      let messageId = `dry-run-${index + 1}`;

      if (!dryRun) {
        const result = await transporter.sendMail(message);
        messageId = result.messageId || '';
      }

      sent += 1;
      reportRows.push({
        ...recipient,
        status: dryRun ? 'dry_run' : 'sent',
        message_id: messageId,
        error: '',
        sent_at: new Date().toISOString(),
      });
    } catch (error) {
      failed += 1;
      reportRows.push({
        ...recipient,
        status: 'error',
        message_id: '',
        error: error.message,
        sent_at: '',
      });
    }

    if (delayMs > 0 && index < selectedRecipients.length - 1) {
      await delay(delayMs);
    }
  }

  const reportPath = buildReportPath();
  writeReport(reportPath, reportRows);

  console.log(JSON.stringify({
    campaignCsv: campaignPath,
    reportPath,
    dryRun,
    selectedRecipients: selectedRecipients.length,
    sent,
    failed,
    smtpHost: transport.smtpHost,
    smtpPort: transport.smtpPort,
    smtpSecure: transport.smtpSecure,
    smtpUser: transport.smtpUser,
  }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao enviar campanha de e-mail:', error.message);
  process.exitCode = 1;
});