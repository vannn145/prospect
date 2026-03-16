const { query } = require('../database/db');

const POSSIBLE_NO_WEBSITE_SQL =
  "(website IS NULL OR BTRIM(website) = '' OR website ~* '(instagram\\.com|facebook\\.com|wa\\.me|linktr\\.ee)')";

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function mapCompany(row) {
  return {
    ...row,
    possible_no_website: Boolean(row.possible_no_website),
  };
}

async function upsertCompany(company) {
  const sql = `
    INSERT INTO companies (
      name, phone, address, city, category, website, instagram_url,
      rating, reviews, status_site, place_id, latitude, longitude, priority_score
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13, $14
    )
    ON CONFLICT (place_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      phone = COALESCE(EXCLUDED.phone, companies.phone),
      address = COALESCE(EXCLUDED.address, companies.address),
      city = EXCLUDED.city,
      category = EXCLUDED.category,
      website = COALESCE(EXCLUDED.website, companies.website),
      instagram_url = COALESCE(EXCLUDED.instagram_url, companies.instagram_url),
      rating = EXCLUDED.rating,
      reviews = EXCLUDED.reviews,
      status_site = EXCLUDED.status_site,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      priority_score = EXCLUDED.priority_score
    RETURNING *, ${POSSIBLE_NO_WEBSITE_SQL} AS possible_no_website;
  `;

  const values = [
    sanitizeText(company.name),
    sanitizeText(company.phone),
    sanitizeText(company.address),
    sanitizeText(company.city),
    sanitizeText(company.category),
    sanitizeText(company.website),
    sanitizeText(company.instagram_url),
    company.rating == null ? null : Number(company.rating),
    Number(company.reviews || 0),
    sanitizeText(company.status_site) || 'sem_site',
    sanitizeText(company.place_id),
    company.latitude == null ? null : Number(company.latitude),
    company.longitude == null ? null : Number(company.longitude),
    Number(company.priority_score || 0),
  ];

  const result = await query(sql, values);
  return mapCompany(result.rows[0]);
}

async function getCompanies({ status } = {}) {
  const filters = [];
  const params = [];

  if (status) {
    params.push(status);
    filters.push(`status_site = $${params.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const sql = `
    SELECT *, ${POSSIBLE_NO_WEBSITE_SQL} AS possible_no_website
    FROM companies
    ${whereClause}
    ORDER BY contacted ASC, possible_no_website DESC, priority_score DESC, created_at DESC;
  `;

  const result = await query(sql, params);
  return result.rows.map(mapCompany);
}

async function markAsContacted(id) {
  const sql = `
    UPDATE companies
    SET contacted = TRUE,
        priority_score = 0
    WHERE id = $1
    RETURNING *, ${POSSIBLE_NO_WEBSITE_SQL} AS possible_no_website;
  `;

  const result = await query(sql, [Number(id)]);
  return result.rows[0] ? mapCompany(result.rows[0]) : null;
}

async function getStats() {
  const sql = `
    SELECT
      COUNT(*)::int AS total_empresas,
      COUNT(*) FILTER (WHERE status_site = 'sem_site')::int AS sem_site,
      COUNT(*) FILTER (WHERE status_site = 'site_fraco')::int AS site_fraco,
      COUNT(*) FILTER (WHERE contacted = TRUE)::int AS contatadas
    FROM companies;
  `;

  const result = await query(sql);
  return result.rows[0];
}

async function getCompaniesMissingInstagram(limit = 100) {
  const sql = `
    SELECT id, name, city, website
    FROM companies
    WHERE (instagram_url IS NULL OR BTRIM(instagram_url) = '')
    ORDER BY created_at DESC
    LIMIT $1;
  `;

  const result = await query(sql, [Number(limit)]);
  return result.rows;
}

async function getCompanyForInstagram(id) {
  const sql = `
    SELECT id, name, city, website, instagram_url
    FROM companies
    WHERE id = $1
    LIMIT 1;
  `;

  const result = await query(sql, [Number(id)]);
  return result.rows[0] || null;
}

async function getCompanyById(id) {
  const sql = `
    SELECT *, ${POSSIBLE_NO_WEBSITE_SQL} AS possible_no_website
    FROM companies
    WHERE id = $1
    LIMIT 1;
  `;

  const result = await query(sql, [Number(id)]);
  return result.rows[0] ? mapCompany(result.rows[0]) : null;
}

async function updateInstagramUrl(id, instagramUrl) {
  const sql = `
    UPDATE companies
    SET instagram_url = $2
    WHERE id = $1
    RETURNING *, ${POSSIBLE_NO_WEBSITE_SQL} AS possible_no_website;
  `;

  const result = await query(sql, [Number(id), sanitizeText(instagramUrl)]);
  return result.rows[0] ? mapCompany(result.rows[0]) : null;
}

async function recalculatePriorityScores() {
  const sql = `
    UPDATE companies
    SET priority_score =
      (CASE
        WHEN contacted = TRUE THEN 0
        WHEN status_site = 'sem_site' THEN 100
        WHEN status_site = 'site_fraco' THEN 70
        ELSE 35
      END)
      +
      (CASE
        WHEN COALESCE(reviews, 0) <= 5 THEN 20
        WHEN COALESCE(reviews, 0) <= 20 THEN 10
        ELSE 0
      END)
      +
      (CASE
        WHEN ${POSSIBLE_NO_WEBSITE_SQL} THEN 25
        ELSE 0
      END)
    RETURNING id;
  `;

  const result = await query(sql);
  return {
    updated: result.rowCount,
  };
}

module.exports = {
  upsertCompany,
  getCompanies,
  markAsContacted,
  getStats,
  getCompaniesMissingInstagram,
  getCompanyForInstagram,
  getCompanyById,
  updateInstagramUrl,
  recalculatePriorityScores,
};
