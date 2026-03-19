const fs = require('fs');
const path = require('path');

const EXPORTS_DIR = path.join(__dirname, '..', 'exports');
const REPORT_PREFIX = 'email-send-report-';
const REPORT_SUFFIX = '.csv';

function csvToRows(content) {
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

  return dataRows.map((dataRow) => {
    const mapped = {};

    headers.forEach((header, index) => {
      mapped[header] = dataRow[index] ?? '';
    });

    return mapped;
  });
}

function findLatestReportFile() {
  if (!fs.existsSync(EXPORTS_DIR)) {
    return null;
  }

  const candidates = fs
    .readdirSync(EXPORTS_DIR)
    .filter((name) => name.startsWith(REPORT_PREFIX) && name.endsWith(REPORT_SUFFIX))
    .map((name) => {
      const filePath = path.join(EXPORTS_DIR, name);
      const stats = fs.statSync(filePath);

      return {
        name,
        filePath,
        mtimeMs: stats.mtimeMs,
        createdAt: stats.mtime.toISOString(),
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return candidates[0] || null;
}

function buildSummary(items) {
  return items.reduce(
    (summary, item) => {
      summary.total += 1;

      const status = String(item.status || '').trim().toLowerCase();
      if (status === 'sent') {
        summary.sent += 1;
      } else if (status === 'dry_run') {
        summary.dryRun += 1;
      } else if (status === 'error') {
        summary.error += 1;
      } else if (status === 'skipped') {
        summary.skipped += 1;
      }

      return summary;
    },
    {
      total: 0,
      sent: 0,
      dryRun: 0,
      error: 0,
      skipped: 0,
    }
  );
}

function normalizeReportItem(item) {
  return {
    company_id: item.company_id || '',
    company_name: item.company_name || '',
    to_email: item.to_email || '',
    status: item.status || '',
    message_id: item.message_id || '',
    error: item.error || '',
    sent_at: item.sent_at || '',
    last_failed_code: item.last_failed_code || '',
  };
}

function getLatestEmailSendReport(limit = 200) {
  const latestReport = findLatestReportFile();

  if (!latestReport) {
    return null;
  }

  const content = fs.readFileSync(latestReport.filePath, 'utf8');
  const parsedItems = csvToRows(content).map(normalizeReportItem);
  const limitedItems = parsedItems.slice(0, Math.max(1, Number(limit || 200)));

  return {
    fileName: latestReport.name,
    filePath: latestReport.filePath,
    createdAt: latestReport.createdAt,
    summary: buildSummary(parsedItems),
    items: limitedItems,
  };
}

module.exports = {
  getLatestEmailSendReport,
};