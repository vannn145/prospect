const axios = require('axios');

function normalizeWebsiteUrl(website) {
  if (!website) {
    return null;
  }

  const trimmed = String(website).trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

function hasMetaTitle(html) {
  if (!html || typeof html !== 'string') {
    return false;
  }

  return /<title[^>]*>[\s\S]*?<\/title>/i.test(html);
}

async function classifyWebsite(website) {
  const normalizedWebsite = normalizeWebsiteUrl(website);

  if (!normalizedWebsite) {
    return {
      status: 'sem_site',
      normalizedWebsite: null,
      reasons: ['website_ausente'],
      loadTimeMs: null,
    };
  }

  const timeoutMs = Number(process.env.SITE_TIMEOUT_MS || 3500);
  const slowThresholdMs = Number(process.env.SITE_SLOW_THRESHOLD_MS || 2500);

  const reasons = [];
  if (!normalizedWebsite.toLowerCase().startsWith('https://')) {
    reasons.push('sem_https');
  }

  let loadTimeMs = null;

  try {
    const start = Date.now();
    const response = await axios.get(normalizedWebsite, {
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: (status) => status < 500,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
      },
    });

    loadTimeMs = Date.now() - start;

    if (loadTimeMs > slowThresholdMs) {
      reasons.push('carregamento_lento');
    }

    if (!hasMetaTitle(response.data)) {
      reasons.push('sem_meta_title');
    }
  } catch (error) {
    reasons.push('site_indisponivel');
  }

  if (reasons.length > 0) {
    return {
      status: 'site_fraco',
      normalizedWebsite,
      reasons,
      loadTimeMs,
    };
  }

  return {
    status: 'site_ok',
    normalizedWebsite,
    reasons: [],
    loadTimeMs,
  };
}

module.exports = {
  classifyWebsite,
  normalizeWebsiteUrl,
};
