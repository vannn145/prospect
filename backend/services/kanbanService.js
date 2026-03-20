const { query } = require('../database/db');

const DEFAULT_COLUMNS = [
  { key: 'entrada', title: 'Entrada', position: 1 },
  { key: 'contato', title: 'Contato', position: 2 },
  { key: 'proposta', title: 'Proposta', position: 3 },
  { key: 'negociacao', title: 'Negociação', position: 4 },
  { key: 'fechado', title: 'Fechado', position: 5 },
  { key: 'perdido', title: 'Perdido', position: 6 },
];

const STAGE_ORDER_SQL = `
  COALESCE(kcol.position, 999)
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

function normalizeColumnKey(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  if (!normalized) {
    throw new Error('Nome da coluna inválido.');
  }

  return normalized;
}

function mapColumn(row) {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    position: row.position,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function ensureDefaultColumns() {
  for (const column of DEFAULT_COLUMNS) {
    await query(
      `
        INSERT INTO kanban_columns (key, title, position)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO NOTHING
      `,
      [column.key, column.title, column.position]
    );
  }
}

async function getKanbanColumns() {
  await ensureDefaultColumns();

  const result = await query(
    `
      SELECT id, key, title, position, created_at, updated_at
      FROM kanban_columns
      ORDER BY position ASC, created_at ASC
    `
  );

  return result.rows.map(mapColumn);
}

async function validateStage(stage) {
  const normalizedStage = String(stage || '').trim();

  if (!normalizedStage) {
    throw new Error('stage inválido.');
  }

  const result = await query('SELECT key FROM kanban_columns WHERE key = $1 LIMIT 1', [normalizedStage]);

  if (!result.rows[0]) {
    const columns = await getKanbanColumns();
    throw new Error(`stage inválido. Use: ${columns.map((item) => item.key).join(', ')}`);
  }

  return normalizedStage;
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
  await ensureDefaultColumns();

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
    LEFT JOIN kanban_columns kcol ON kcol.key = kc.stage
    ORDER BY ${STAGE_ORDER_SQL}, kc.updated_at DESC
  `);

  return result.rows.map(mapCard);
}

async function addCompanyToKanban({ companyId, stage = 'entrada' }) {
  const parsedCompanyId = Number(companyId);

  if (!parsedCompanyId) {
    throw new Error('companyId inválido.');
  }

  const normalizedStage = await validateStage(stage);

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
    [parsedCompanyId, normalizedStage]
  );

  const cardId = insertResult.rows[0]?.id;
  return fetchCardById(cardId);
}

async function updateKanbanCard(cardId, payload) {
  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(payload, 'stage')) {
    const stage = sanitizeText(payload.stage) || 'entrada';
    const normalizedStage = await validateStage(stage);
    values.push(normalizedStage);
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

async function createKanbanColumn({ title, key }) {
  await ensureDefaultColumns();

  const normalizedTitle = sanitizeText(title);

  if (!normalizedTitle) {
    throw new Error('title é obrigatório para criar a coluna.');
  }

  const normalizedKey = normalizeColumnKey(key || normalizedTitle);
  const nextPositionResult = await query('SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM kanban_columns');
  const nextPosition = Number(nextPositionResult.rows[0]?.next_position || 1);

  const result = await query(
    `
      INSERT INTO kanban_columns (key, title, position, updated_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id, key, title, position, created_at, updated_at
    `,
    [normalizedKey, normalizedTitle, nextPosition]
  );

  return mapColumn(result.rows[0]);
}

async function deleteKanbanColumn(columnKey) {
  await ensureDefaultColumns();

  const normalizedKey = normalizeColumnKey(columnKey);
  const columns = await getKanbanColumns();
  const target = columns.find((item) => item.key === normalizedKey);

  if (!target) {
    throw new Error('Coluna não encontrada.');
  }

  if (columns.length <= 1) {
    throw new Error('Não é possível excluir a última coluna do Kanban.');
  }

  const fallback = columns
    .filter((item) => item.key !== normalizedKey)
    .sort((left, right) => left.position - right.position)[0];

  await query('UPDATE kanban_cards SET stage = $1, updated_at = NOW() WHERE stage = $2', [fallback.key, normalizedKey]);
  await query('DELETE FROM kanban_columns WHERE key = $1', [normalizedKey]);

  const refreshed = await getKanbanColumns();

  for (let index = 0; index < refreshed.length; index += 1) {
    const column = refreshed[index];
    const desiredPosition = index + 1;

    if (Number(column.position) !== desiredPosition) {
      await query('UPDATE kanban_columns SET position = $1, updated_at = NOW() WHERE id = $2', [desiredPosition, column.id]);
    }
  }

  return {
    deletedKey: normalizedKey,
    movedCardsTo: fallback.key,
  };
}

module.exports = {
  KANBAN_STAGES: DEFAULT_COLUMNS.map((item) => item.key),
  getKanbanColumns,
  createKanbanColumn,
  deleteKanbanColumn,
  getKanbanCards,
  getKanbanCardById,
  addCompanyToKanban,
  updateKanbanCard,
};
