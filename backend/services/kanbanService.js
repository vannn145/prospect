const { query } = require('../database/db');

const KANBAN_STAGES = ['entrada', 'contato', 'proposta', 'negociacao', 'fechado', 'perdido'];

const STAGE_ORDER_SQL = `
  CASE kc.stage
    WHEN 'entrada' THEN 1
    WHEN 'contato' THEN 2
    WHEN 'proposta' THEN 3
    WHEN 'negociacao' THEN 4
    WHEN 'fechado' THEN 5
    WHEN 'perdido' THEN 6
    ELSE 99
  END
`;

function sanitizeText(value) {
  if (value == null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeProposalValue(value) {
  if (value == null || value === '') {
    return null;
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    throw new Error('proposal_value inválido.');
  }

  return numericValue;
}

function normalizeDueDate(value) {
  if (value == null || value === '') {
    return null;
  }

  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('due_date deve estar no formato YYYY-MM-DD.');
  }

  return normalized;
}

function validateStage(stage) {
  if (!KANBAN_STAGES.includes(stage)) {
    throw new Error(`stage inválido. Use: ${KANBAN_STAGES.join(', ')}`);
  }
}

function mapCard(row) {
  return {
    id: row.id,
    company_id: row.company_id,
    stage: row.stage,
    notes: row.notes,
    next_action: row.next_action,
    proposal_value: row.proposal_value,
    due_date: row.due_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    company: {
      id: row.company_id,
      name: row.company_name,
      phone: row.company_phone,
      city: row.company_city,
      category: row.company_category,
      website: row.company_website,
      instagram_url: row.company_instagram_url,
      status_site: row.company_status_site,
      address: row.company_address,
      contacted: row.company_contacted,
    },
  };
}

async function fetchCardById(cardId) {
  const result = await query(
    `
      SELECT
        kc.id,
        kc.company_id,
        kc.stage,
        kc.notes,
        kc.next_action,
        kc.proposal_value,
        kc.due_date,
        kc.created_at,
        kc.updated_at,
        c.name AS company_name,
        c.phone AS company_phone,
        c.city AS company_city,
        c.category AS company_category,
        c.website AS company_website,
        c.instagram_url AS company_instagram_url,
        c.status_site AS company_status_site,
        c.address AS company_address,
        c.contacted AS company_contacted
      FROM kanban_cards kc
      INNER JOIN companies c ON c.id = kc.company_id
      WHERE kc.id = $1
    `,
    [Number(cardId)]
  );

  return result.rows[0] ? mapCard(result.rows[0]) : null;
}

async function getKanbanCardById(cardId) {
  return fetchCardById(cardId);
}

async function getKanbanCards() {
  const result = await query(`
    SELECT
      kc.id,
      kc.company_id,
      kc.stage,
      kc.notes,
      kc.next_action,
      kc.proposal_value,
      kc.due_date,
      kc.created_at,
      kc.updated_at,
      c.name AS company_name,
      c.phone AS company_phone,
      c.city AS company_city,
      c.category AS company_category,
      c.website AS company_website,
      c.instagram_url AS company_instagram_url,
      c.status_site AS company_status_site,
      c.address AS company_address,
      c.contacted AS company_contacted
    FROM kanban_cards kc
    INNER JOIN companies c ON c.id = kc.company_id
    ORDER BY ${STAGE_ORDER_SQL}, kc.updated_at DESC
  `);

  return result.rows.map(mapCard);
}

async function addCompanyToKanban({ companyId, stage = 'entrada' }) {
  const parsedCompanyId = Number(companyId);

  if (!parsedCompanyId) {
    throw new Error('companyId inválido.');
  }

  validateStage(stage);

  const companyExists = await query('SELECT id FROM companies WHERE id = $1', [parsedCompanyId]);
  if (!companyExists.rows[0]) {
    throw new Error('Empresa não encontrada.');
  }

  const insertResult = await query(
    `
      INSERT INTO kanban_cards (company_id, stage)
      VALUES ($1, $2)
      ON CONFLICT (company_id)
      DO UPDATE SET updated_at = NOW()
      RETURNING id;
    `,
    [parsedCompanyId, stage]
  );

  const cardId = insertResult.rows[0]?.id;
  return fetchCardById(cardId);
}

async function updateKanbanCard(cardId, payload) {
  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(payload, 'stage')) {
    const stage = sanitizeText(payload.stage) || 'entrada';
    validateStage(stage);
    values.push(stage);
    updates.push(`stage = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'notes')) {
    values.push(sanitizeText(payload.notes));
    updates.push(`notes = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'next_action')) {
    values.push(sanitizeText(payload.next_action));
    updates.push(`next_action = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'proposal_value')) {
    values.push(normalizeProposalValue(payload.proposal_value));
    updates.push(`proposal_value = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'due_date')) {
    values.push(normalizeDueDate(payload.due_date));
    updates.push(`due_date = $${values.length}`);
  }

  if (!updates.length) {
    throw new Error('Nenhum campo válido para atualização.');
  }

  updates.push('updated_at = NOW()');
  values.push(Number(cardId));

  const sql = `
    UPDATE kanban_cards
    SET ${updates.join(', ')}
    WHERE id = $${values.length}
    RETURNING id;
  `;

  const result = await query(sql, values);
  if (!result.rows[0]) {
    return null;
  }

  return fetchCardById(result.rows[0].id);
}

module.exports = {
  KANBAN_STAGES,
  getKanbanCards,
  getKanbanCardById,
  addCompanyToKanban,
  updateKanbanCard,
};
