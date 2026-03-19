const fs = require('fs');
const path = require('path');

const axios = require('axios');
const cheerio = require('cheerio');

const { initDatabase } = require('../database/initDb');
const { pool, query } = require('../database/db');
const { normalizeWebsiteUrl } = require('../services/siteClassifierService');

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi;
const CONTACT_KEYWORDS = ['contato', 'contact', 'fale-conosco', 'faleconosco', 'atendimento', 'sobre'];
const FILTERED_WEBSITE_REGEX = /(instagram\.com|facebook\.com|wa\.me|linktr\.ee)/i;
const EMAIL_STATUS = {
  FOUND: 'found',
  NOT_FOUND: 'not_found',
  ERROR: 'error',
  SKIPPED: 'skipped',
};

const REQUEST_TIMEOUT_MS = Number(process.env.EMAIL_ENRICHMENT_TIMEOUT_MS || 8000);
const CONCURRENCY = Number(process.env.EMAIL_ENRICHMENT_CONCURRENCY || 6);
const MAX_CONTACT_PAGES = Number(process.env.EMAIL_ENRICHMENT_MAX_CONTACT_PAGES || 5);
const FROM_EMAIL = process.env.OUTREACH_FROM_EMAIL || 'contato@impulsestrategy.com.br';
const SUBJECT_TEMPLATE = process.env.OUTREACH_EMAIL_SUBJECT_TEMPLATE || 'Ideia rápida para {{company_name}}';
const BODY_TEMPLATE = process.env.OUTREACH_EMAIL_BODY_TEMPLATE || [
  'Olá, tudo bem?',
  '',
  'Encontrei a {{company_name}} e identifiquei uma oportunidade de fortalecer a presença digital da empresa para gerar mais contatos qualificados.',
  '',
  'Se fizer sentido, posso te mostrar rapidamente algumas ideias práticas para {{company_name}}.',
  '',
  'Atenciosamente,',
  'Impulse Strategy',
  FROM_EMAIL,
].join('\n');

function buildHttpClient() {
  return axios.create({
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 500,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
}

function normalizeHost(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
}

function tryDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeCloudflareEmail(encoded) {
  if (!encoded || encoded.length < 4) {
    return null;
  }

  try {
    const key = parseInt(encoded.slice(0, 2), 16);
    let decoded = '';

    for (let index = 2; index < encoded.length; index += 2) {
      const value = parseInt(encoded.slice(index, index + 2), 16) ^ key;
      decoded += String.fromCharCode(value);
    }

    return decoded;
  } catch {
    return null;
  }
}

function decodeTextForEmailSearch(value) {
  return String(value || '')
    .replace(/&#64;|&commat;|%40/gi, '@')
    .replace(/&#46;|&period;|%2E/gi, '.')
    .replace(/\[\s*at\s*\]|\(\s*at\s*\)/gi, '@')
    .replace(/\[\s*dot\s*\]|\(\s*dot\s*\)/gi, '.')
    .replace(/\s+/g, ' ');
}

function normalizeEmail(email) {
  return String(email || '').trim().replace(/^mailto:/i, '').replace(/[>"'`;:,]+$/g, '').toLowerCase();
}

function isLikelyValidEmail(email) {
  const normalized = normalizeEmail(email);

  if (!normalized || !EMAIL_REGEX.test(normalized)) {
    EMAIL_REGEX.lastIndex = 0;
    return false;
  }

  EMAIL_REGEX.lastIndex = 0;

  const [localPart = '', domain = ''] = normalized.split('@');

  if (!localPart || !domain) {
    return false;
  }

  if (['example.com', 'domain.com', 'email.com'].includes(domain)) {
    return false;
  }

  if (/\.(png|jpe?g|gif|svg|webp|js|css)$/i.test(domain)) {
    return false;
  }

  return true;
}

function scoreEmail(email, websiteHost) {
  const normalized = normalizeEmail(email);
  const [localPart = '', domain = ''] = normalized.split('@');
  const normalizedWebsiteHost = normalizeHost(websiteHost);
  let score = 0;

  if (normalizedWebsiteHost && (domain === normalizedWebsiteHost || domain.endsWith(`.${normalizedWebsiteHost}`) || normalizedWebsiteHost.endsWith(`.${domain}`))) {
    score += 60;
  }

  if (/(contato|contact|comercial|atendimento|hello|ola|oi|vendas|marketing)/i.test(localPart)) {
    score += 25;
  }

  if (/(gmail|outlook|hotmail|uol|bol|yahoo)\./i.test(domain)) {
    score += 10;
  }

  if (/(noreply|no-reply|donotreply|do-not-reply|abuse|privacy|privacidade|webmaster)/i.test(localPart)) {
    score -= 100;
  }

  return score;
}

function extractEmailCandidatesFromHtml({ html, sourceUrl, websiteHost }) {
  const $ = cheerio.load(html || '');
  const candidates = new Map();

  function collect(rawEmail, origin) {
    const normalized = normalizeEmail(rawEmail);
    if (!isLikelyValidEmail(normalized)) {
      return;
    }

    const previous = candidates.get(normalized);
    const scored = {
      email: normalized,
      sourceUrl,
      sourceType: origin,
      score: scoreEmail(normalized, websiteHost),
    };

    if (!previous || scored.score > previous.score) {
      candidates.set(normalized, scored);
    }
  }

  $('a[href^="mailto:"]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) {
      return;
    }

    const decodedHref = tryDecodeURIComponent(href).replace(/^mailto:/i, '').split('?')[0];
    collect(decodedHref, 'mailto');
  });

  $('[data-cfemail]').each((_, element) => {
    const encoded = $(element).attr('data-cfemail');
    const decoded = decodeCloudflareEmail(encoded);

    if (decoded) {
      collect(decoded, 'cloudflare');
    }
  });

  $('a[href*="/cdn-cgi/l/email-protection#"]').each((_, element) => {
    const href = $(element).attr('href') || '';
    const encoded = href.split('#')[1] || '';
    const decoded = decodeCloudflareEmail(encoded);

    if (decoded) {
      collect(decoded, 'cloudflare');
    }
  });

  const searchableText = decodeTextForEmailSearch(`${html}\n${$.text()}`);
  const regex = new RegExp(EMAIL_REGEX);
  let match = regex.exec(searchableText);

  while (match) {
    collect(match[0], 'text');
    match = regex.exec(searchableText);
  }

  return [...candidates.values()].sort((left, right) => right.score - left.score || left.email.localeCompare(right.email));
}

function discoverContactPageUrls(baseUrl, html) {
  const $ = cheerio.load(html || '');
  const urls = new Set();
  const base = new URL(baseUrl);
  const baseHost = normalizeHost(base.hostname);

  function addCandidate(href) {
    if (!href) {
      return;
    }

    try {
      const resolved = new URL(href, baseUrl);
      const host = normalizeHost(resolved.hostname);

      if (host !== baseHost) {
        return;
      }

      urls.add(resolved.toString());
    } catch {
      // ignora href inválido
    }
  }

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    const text = $(element).text();
    const haystack = `${href || ''} ${text || ''}`.toLowerCase();

    if (CONTACT_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
      addCandidate(href);
    }
  });

  ['/contato', '/contact', '/fale-conosco', '/atendimento', '/sobre'].forEach((suffix) => addCandidate(suffix));

  urls.delete(baseUrl);

  return [...urls].slice(0, MAX_CONTACT_PAGES);
}

async function fetchHtml(client, website) {
  const normalized = normalizeWebsiteUrl(website);

  if (!normalized) {
    return {
      ok: false,
      errorMessage: 'Website ausente.',
      finalUrl: null,
      html: null,
    };
  }

  const variants = new Set([normalized]);
  if (normalized.startsWith('http://')) {
    variants.add(normalized.replace(/^http:/i, 'https:'));
  } else if (normalized.startsWith('https://')) {
    variants.add(normalized.replace(/^https:/i, 'http:'));
  }

  let lastErrorMessage = 'Falha ao carregar website.';

  for (const url of variants) {
    try {
      const response = await client.get(url);

      if (typeof response.data === 'string' && response.data.trim()) {
        const finalUrl = response.request?.res?.responseUrl || url;
        return {
          ok: true,
          html: response.data,
          finalUrl,
          errorMessage: null,
        };
      }

      lastErrorMessage = `Resposta vazia em ${url}.`;
    } catch (error) {
      lastErrorMessage = error.message;
    }
  }

  return {
    ok: false,
    errorMessage: lastErrorMessage,
    finalUrl: normalized,
    html: null,
  };
}

async function findBestContactEmail(company, client) {
  const website = normalizeWebsiteUrl(company.website);

  if (!website || FILTERED_WEBSITE_REGEX.test(website)) {
    return {
      status: EMAIL_STATUS.SKIPPED,
      email: null,
      sourceUrl: null,
      errorMessage: 'Website não elegível para extração.',
    };
  }

  const homePage = await fetchHtml(client, website);

  if (!homePage.ok || !homePage.html) {
    return {
      status: EMAIL_STATUS.ERROR,
      email: null,
      sourceUrl: homePage.finalUrl,
      errorMessage: homePage.errorMessage,
    };
  }

  const websiteHost = new URL(homePage.finalUrl).hostname;
  let candidates = extractEmailCandidatesFromHtml({
    html: homePage.html,
    sourceUrl: homePage.finalUrl,
    websiteHost,
  });

  if (!candidates.length) {
    const contactPageUrls = discoverContactPageUrls(homePage.finalUrl, homePage.html);

    for (const contactPageUrl of contactPageUrls) {
      const page = await fetchHtml(client, contactPageUrl);

      if (!page.ok || !page.html) {
        continue;
      }

      candidates = extractEmailCandidatesFromHtml({
        html: page.html,
        sourceUrl: page.finalUrl,
        websiteHost,
      });

      if (candidates.length) {
        break;
      }
    }
  }

  if (!candidates.length) {
    return {
      status: EMAIL_STATUS.NOT_FOUND,
      email: null,
      sourceUrl: homePage.finalUrl,
      errorMessage: null,
    };
  }

  return {
    status: EMAIL_STATUS.FOUND,
    email: candidates[0].email,
    sourceUrl: candidates[0].sourceUrl,
    errorMessage: null,
  };
}

async function getFailedOutboundCompanies() {
  const result = await query(
    `
      SELECT DISTINCT ON (c.id)
        c.id,
        c.name,
        c.phone,
        c.city,
        c.category,
        c.website,
        c.contact_email,
        c.contact_email_status,
        c.contact_email_source_url,
        wm.created_at AS last_failed_at,
        wm.raw_payload->'errors'->0->>'code' AS last_failed_code,
        wm.raw_payload->'errors'->0->>'title' AS last_failed_title
      FROM companies c
      INNER JOIN whatsapp_contacts wc ON wc.company_id = c.id
      INNER JOIN whatsapp_messages wm ON wm.contact_id = wc.id
      WHERE wm.direction = 'outbound'
        AND wm.status = 'failed'
        AND c.website IS NOT NULL
        AND BTRIM(c.website) <> ''
        AND c.website !~* '(instagram\\.com|facebook\\.com|wa\\.me|linktr\\.ee)'
      ORDER BY c.id, wm.created_at DESC
    `
  );

  return result.rows;
}

async function updateCompanyEmail(companyId, payload) {
  await query(
    `
      UPDATE companies
      SET contact_email = $2,
          contact_email_status = $3,
          contact_email_source_url = $4,
          contact_email_checked_at = NOW(),
          contact_email_error = $5
      WHERE id = $1
    `,
    [companyId, payload.email || null, payload.status, payload.sourceUrl || null, payload.errorMessage || null]
  );
}

function renderTemplate(template, company) {
  const replacements = {
    company_name: company.name || '',
    city: company.city || '',
    category: company.category || '',
    website: company.website || '',
    from_email: FROM_EMAIL,
  };

  return String(template).replace(/{{\s*([a-z_]+)\s*}}/gi, (_, key) => replacements[key] || '');
}

function csvEscape(value) {
  const normalized = String(value ?? '');
  return `"${normalized.replace(/"/g, '""')}"`;
}

function writeCsv(rows) {
  const outputDir = path.join(__dirname, '..', 'exports');
  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const filePath = path.join(outputDir, `failed-whatsapp-email-campaign-${timestamp}.csv`);

  const headers = [
    'company_id',
    'company_name',
    'to_email',
    'from_email',
    'subject',
    'body',
    'website',
    'phone',
    'city',
    'category',
    'last_failed_code',
    'last_failed_title',
    'last_failed_at',
    'email_source_url',
  ];

  const lines = [headers.map(csvEscape).join(',')];

  for (const row of rows) {
    lines.push([
      row.company_id,
      row.company_name,
      row.to_email,
      row.from_email,
      row.subject,
      row.body,
      row.website,
      row.phone,
      row.city,
      row.category,
      row.last_failed_code,
      row.last_failed_title,
      row.last_failed_at,
      row.email_source_url,
    ].map(csvEscape).join(','));
  }

  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
  return filePath;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const safeConcurrency = Math.max(1, Number(concurrency || 1));
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const targetIndex = currentIndex;
      currentIndex += 1;
      results[targetIndex] = await mapper(items[targetIndex], targetIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(safeConcurrency, items.length || 1) }, () => worker()));
  return results;
}

async function main() {
  await initDatabase();

  const client = buildHttpClient();
  const failedCompanies = await getFailedOutboundCompanies();

  let reusedExisting = 0;
  let found = 0;
  let notFound = 0;
  let errors = 0;
  let skipped = 0;

  const processed = await mapWithConcurrency(failedCompanies, CONCURRENCY, async (company) => {
    if (company.contact_email) {
      reusedExisting += 1;

      return {
        ...company,
        resolved_email: company.contact_email,
        resolved_source_url: company.contact_email_source_url,
      };
    }

    const result = await findBestContactEmail(company, client);
    await updateCompanyEmail(company.id, result);

    if (result.status === EMAIL_STATUS.FOUND) {
      found += 1;
    } else if (result.status === EMAIL_STATUS.NOT_FOUND) {
      notFound += 1;
    } else if (result.status === EMAIL_STATUS.ERROR) {
      errors += 1;
    } else {
      skipped += 1;
    }

    return {
      ...company,
      resolved_email: result.email,
      resolved_source_url: result.sourceUrl,
    };
  });

  const campaignRows = processed
    .filter((company) => company.resolved_email)
    .map((company) => ({
      company_id: company.id,
      company_name: company.name,
      to_email: company.resolved_email,
      from_email: FROM_EMAIL,
      subject: renderTemplate(SUBJECT_TEMPLATE, company),
      body: renderTemplate(BODY_TEMPLATE, company),
      website: company.website || '',
      phone: company.phone || '',
      city: company.city || '',
      category: company.category || '',
      last_failed_code: company.last_failed_code || '',
      last_failed_title: company.last_failed_title || '',
      last_failed_at: company.last_failed_at || '',
      email_source_url: company.resolved_source_url || '',
    }))
    .sort((left, right) => String(right.last_failed_at).localeCompare(String(left.last_failed_at)));

  const csvPath = writeCsv(campaignRows);

  console.log(JSON.stringify({
    totalFailedCompaniesWithWebsite: failedCompanies.length,
    reusedExisting,
    found,
    notFound,
    errors,
    skipped,
    readyToSend: campaignRows.length,
    fromEmail: FROM_EMAIL,
    csvPath,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('Erro ao preparar campanha de e-mail:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });