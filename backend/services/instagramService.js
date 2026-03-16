const axios = require('axios');
const cheerio = require('cheerio');
const {
  getCompaniesMissingInstagram,
  getCompanyForInstagram,
  updateInstagramUrl,
} = require('./companyRepositoryService');

function normalizeInstagramUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  let urlToParse = rawUrl.trim();
  if (!urlToParse) {
    return null;
  }

  try {
    if (urlToParse.includes('duckduckgo.com/l/?')) {
      const parsedDuck = new URL(urlToParse);
      const redirect = parsedDuck.searchParams.get('uddg');
      if (redirect) {
        urlToParse = decodeURIComponent(redirect);
      }
    }

    if (!/^https?:\/\//i.test(urlToParse)) {
      urlToParse = `https://${urlToParse}`;
    }

    const parsed = new URL(urlToParse);
    if (!/instagram\.com$/i.test(parsed.hostname.replace(/^www\./i, ''))) {
      return null;
    }

    const [, profile] = parsed.pathname.match(/^\/([a-zA-Z0-9._-]+)\/?/) || [];
    if (!profile) {
      return null;
    }

    const blocked = ['p', 'reel', 'explore', 'accounts', 'stories'];
    if (blocked.includes(profile.toLowerCase())) {
      return null;
    }

    return `https://www.instagram.com/${profile}/`;
  } catch (error) {
    return null;
  }
}

function extractInstagramFromHtml(html) {
  if (!html || typeof html !== 'string') {
    return null;
  }

  const regex = /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._-]+\/?/gi;
  const matches = html.match(regex);
  if (!matches || matches.length === 0) {
    return null;
  }

  for (const candidate of matches) {
    const normalized = normalizeInstagramUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

async function findInstagramOnWebsite(website) {
  if (!website) {
    return null;
  }

  let normalizedWebsite = website.trim();
  if (!/^https?:\/\//i.test(normalizedWebsite)) {
    normalizedWebsite = `https://${normalizedWebsite}`;
  }

  try {
    const response = await axios.get(normalizedWebsite, {
      timeout: Number(process.env.INSTAGRAM_SEARCH_TIMEOUT_MS || 8000),
      maxRedirects: 5,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
      },
      validateStatus: (status) => status < 500,
    });

    const fromRawHtml = extractInstagramFromHtml(response.data);
    if (fromRawHtml) {
      return fromRawHtml;
    }

    const $ = cheerio.load(response.data);
    const anchors = $('a[href]').toArray();

    for (const anchor of anchors) {
      const href = $(anchor).attr('href');
      const normalized = normalizeInstagramUrl(href);
      if (normalized) {
        return normalized;
      }
    }
  } catch (error) {
    return null;
  }

  return null;
}

async function searchInstagramByCompanyName(name, city) {
  if (!name) {
    return null;
  }

  const query = `${name} ${city || ''} instagram`.trim();

  try {
    const response = await axios.get('https://duckduckgo.com/html/', {
      params: { q: query },
      timeout: Number(process.env.INSTAGRAM_SEARCH_TIMEOUT_MS || 8000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
      },
      validateStatus: (status) => status < 500,
    });

    const $ = cheerio.load(response.data);
    const links = $('a[href]').toArray();

    for (const link of links) {
      const href = $(link).attr('href');
      const normalized = normalizeInstagramUrl(href);
      if (normalized) {
        return normalized;
      }
    }
  } catch (error) {
    return null;
  }

  return null;
}

async function detectInstagram(company) {
  if (!company || !company.name) {
    return null;
  }

  const fromWebsite = await findInstagramOnWebsite(company.website);
  if (fromWebsite) {
    return fromWebsite;
  }

  return searchInstagramByCompanyName(company.name, company.city);
}

async function enrichCompanyInstagram(companyId) {
  const company = await getCompanyForInstagram(companyId);

  if (!company) {
    throw new Error('Empresa não encontrada.');
  }

  if (company.instagram_url) {
    return {
      found: true,
      company: await updateInstagramUrl(company.id, company.instagram_url),
      instagram_url: company.instagram_url,
    };
  }

  const instagramUrl = await detectInstagram(company);

  if (!instagramUrl) {
    return {
      found: false,
      company: null,
      instagram_url: null,
    };
  }

  const updatedCompany = await updateInstagramUrl(company.id, instagramUrl);

  return {
    found: true,
    company: updatedCompany,
    instagram_url: instagramUrl,
  };
}

async function enrichMissingInstagrams(limit = 30) {
  const companies = await getCompaniesMissingInstagram(limit);
  const updatedCompanies = [];
  let analyzed = 0;

  for (const company of companies) {
    analyzed += 1;

    const instagramUrl = await detectInstagram(company);
    if (!instagramUrl) {
      continue;
    }

    const updatedCompany = await updateInstagramUrl(company.id, instagramUrl);
    updatedCompanies.push(updatedCompany);
  }

  return {
    analyzed,
    updated: updatedCompanies.length,
    items: updatedCompanies,
  };
}

module.exports = {
  detectInstagram,
  enrichCompanyInstagram,
  enrichMissingInstagrams,
  findInstagramOnWebsite,
  searchInstagramByCompanyName,
};
