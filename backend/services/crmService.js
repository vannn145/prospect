const nodemailer = require('nodemailer');

const { query } = require('../database/db');
const { sendMetaWhatsAppMessage } = require('./metaWhatsAppService');
const { saveOutboundToInbox } = require('./whatsappInboxService');

const KANBAN_STAGES = ['entrada', 'contato', 'proposta', 'negociacao', 'fechado', 'perdido'];
const TASK_STATUSES = ['pending', 'in_progress', 'done', 'canceled'];
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const SUCCESS_WHATSAPP_STATUSES = new Set(['accepted', 'sent', 'delivered', 'read']);

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

const STAGE_LABELS = {
  entrada: 'Entrada',
  contato: 'Contato',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  fechado: 'Fechado',
  perdido: 'Perdido',
};

const DEFAULT_STAGE_TASK_RULES = {
  contato: {
    title: 'Fazer follow-up inicial',
    description: 'Enviar retorno inicial e confirmar interesse do lead.',
    dueDays: 1,
    priority: 'high',
  },
  proposta: {
    title: 'Cobrar retorno da proposta',
    description: 'Confirmar recebimento e percepção de valor da proposta.',
    dueDays: 2,
    priority: 'high',
  },
  negociacao: {
    title: 'Conduzir negociação',
    description: 'Alinhar objeções e validar fechamento.',
    dueDays: 1,
    priority: 'urgent',
  },
  fechado: {
    title: 'Iniciar onboarding do cliente',
    description: 'Alinhar próximos passos de execução e entrega.',
    dueDays: 1,
    priority: 'medium',
  },
};

const DEFAULT_STAGE_WHATSAPP_TEXT = {
  contato: 'Olá, {{company_name}}! Avancei seu atendimento para a etapa de contato. Posso te enviar um diagnóstico rápido da sua presença digital?',
  proposta: 'Olá, {{company_name}}! Prepararei uma proposta objetiva para sua empresa ainda hoje. Prefere receber por WhatsApp ou e-mail?',
  negociacao: 'Olá, {{company_name}}! Estamos na etapa de negociação. Posso ajustar escopo e prazo para fechar da melhor forma para você.',
  fechado: 'Perfeito, {{company_name}}! Negócio fechado ✅ Vamos iniciar o onboarding para colocar seu projeto em execução.',
};

const DEFAULT_STAGE_EMAIL_SUBJECT = {
  contato: 'Seguimento comercial - {{company_name}}',
  proposta: 'Proposta comercial - {{company_name}}',
  negociacao: 'Ajustes finais de proposta - {{company_name}}',
  fechado: 'Onboarding iniciado - {{company_name}}',
};

const DEFAULT_STAGE_EMAIL_BODY = {
  contato: 'Olá, equipe {{company_name}}.\n\nSeu lead avançou para a etapa de contato no CRM.\n\nPodemos seguir com um diagnóstico rápido para estruturar a melhor proposta?\n',
  proposta: 'Olá, equipe {{company_name}}.\n\nSeu atendimento avançou para proposta.\n\nPodemos confirmar o melhor e-mail para envio da proposta comercial?\n',
  negociacao: 'Olá, equipe {{company_name}}.\n\nSeu atendimento está em negociação.\n\nPodemos alinhar os últimos ajustes para concluir o fechamento?\n',
  fechado: 'Olá, equipe {{company_name}}.\n\nNegócio fechado com sucesso ✅\n\nVamos iniciar o onboarding e próximos passos de execução.\n',
};

const STAGE_NEXT_ACTION_HINTS = {
  entrada: {
    title: 'Fazer primeiro contato com o lead',
    reason: 'Lead ainda em entrada e sem avanço de relacionamento.',
  },
  contato: {
    title: 'Executar follow-up de qualificação',
    reason: 'Etapa de contato pede validação de interesse e dor principal.',
  },
  proposta: {
    title: 'Cobrar retorno da proposta enviada',
    reason: 'Manter cadência aumenta taxa de resposta na etapa de proposta.',
  },
  negociacao: {
    title: 'Conduzir fechamento com deadline claro',
    reason: 'Negociação ativa precisa de próximo passo objetivo para fechamento.',
  },
  fechado: {
    title: 'Iniciar onboarding comercial',
    reason: 'Conta fechada deve migrar para execução sem atraso.',
  },
  perdido: {
    title: 'Tentar reativação com nova abordagem',
    reason: 'Lead perdido pode voltar com oferta ou timing diferente.',
  },
};

let cachedTransporter = null;
let cachedTransportSignature = '';

function sanitizeText(value) {
  if (value == null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed || null;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.floor(parsed);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeStage(value) {
  const normalized = sanitizeText(value);

  if (!normalized) {
    return null;
  }

  if (!KANBAN_STAGES.includes(normalized)) {
    throw new Error(`stage inválido. Use: ${KANBAN_STAGES.join(', ')}`);
  }

  return normalized;
}

function normalizeTaskStatus(value, fallback = 'pending') {
  const normalized = String(value || fallback).trim().toLowerCase();

  if (!TASK_STATUSES.includes(normalized)) {
    throw new Error(`status inválido. Use: ${TASK_STATUSES.join(', ')}`);
  }

  return normalized;
}

function normalizeTaskPriority(value, fallback = 'medium') {
  const normalized = String(value || fallback).trim().toLowerCase();

  if (!TASK_PRIORITIES.includes(normalized)) {
    throw new Error(`priority inválida. Use: ${TASK_PRIORITIES.join(', ')}`);
  }

  return normalized;
}

function normalizeDueDate(value) {
  if (value == null || value === '') {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('due_date inválida. Use formato ISO válido.');
  }

  return parsedDate.toISOString();
}

function decodeEscapedNewlines(value) {
  return String(value || '').replace(/\\n/g, '\n');
}

function renderCompanyTemplate(template, company) {
  if (!template) {
    return '';
  }

  return String(template)
    .replace(/\{\{\s*company_name\s*\}\}/gi, String(company?.name || '').trim())
    .replace(/\{\{\s*city\s*\}\}/gi, String(company?.city || '').trim())
    .replace(/\{\{\s*category\s*\}\}/gi, String(company?.category || '').trim());
}

function addDaysToNow(daysToAdd) {
  const date = new Date();
  date.setDate(date.getDate() + Number(daysToAdd || 0));
  return date.toISOString();
}

function parseStageTemplateMap(rawValue) {
  const raw = String(rawValue || '').trim();

  if (!raw) {
    return {};
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const separatorIndex = item.indexOf(':');

      if (separatorIndex <= 0) {
        return acc;
      }

      const stage = String(item.slice(0, separatorIndex)).trim().toLowerCase();
      const templateName = String(item.slice(separatorIndex + 1)).trim();

      if (!KANBAN_STAGES.includes(stage) || !templateName) {
        return acc;
      }

      acc[stage] = templateName;
      return acc;
    }, {});
}

function getWhatsAppAutomationMode() {
  const mode = String(process.env.CRM_AUTOMATION_WHATSAPP_MODE || 'template').trim().toLowerCase();
  return mode === 'text' ? 'text' : 'template';
}

function getWhatsAppAutomationTemplateName(stage) {
  const mapping = parseStageTemplateMap(process.env.CRM_AUTOMATION_WHATSAPP_TEMPLATE_BY_STAGE || '');
  return mapping[stage] || process.env.META_WHATSAPP_TEMPLATE_NAME || null;
}

function getStageWhatsAppText(stage, company) {
  const envKey = `CRM_AUTOMATION_WHATSAPP_TEXT_${String(stage || '').toUpperCase()}`;
  const configured = sanitizeText(process.env[envKey]);
  const template = configured
    ? decodeEscapedNewlines(configured)
    : (DEFAULT_STAGE_WHATSAPP_TEXT[stage] || 'Olá, {{company_name}}! Atualizamos sua etapa no CRM.');

  return renderCompanyTemplate(template, company).trim();
}

function getStageEmailSubject(stage, company) {
  const envKey = `CRM_AUTOMATION_EMAIL_SUBJECT_${String(stage || '').toUpperCase()}`;
  const configured = sanitizeText(process.env[envKey]);
  const template = configured
    ? decodeEscapedNewlines(configured)
    : (DEFAULT_STAGE_EMAIL_SUBJECT[stage] || 'Atualização do seu atendimento - {{company_name}}');

  return renderCompanyTemplate(template, company).trim();
}

function getStageEmailBody(stage, company) {
  const envKey = `CRM_AUTOMATION_EMAIL_BODY_${String(stage || '').toUpperCase()}`;
  const configured = sanitizeText(process.env[envKey]);
  const template = configured
    ? decodeEscapedNewlines(configured)
    : (DEFAULT_STAGE_EMAIL_BODY[stage] || 'Olá, {{company_name}}.\n\nAtualizamos sua etapa no CRM.\n');

  return renderCompanyTemplate(template, company).trim();
}

function getAutomationConfig() {
  return {
    whatsappEnabled: parseBoolean(process.env.CRM_AUTOMATION_WHATSAPP_ENABLED, true),
    emailEnabled: parseBoolean(process.env.CRM_AUTOMATION_EMAIL_ENABLED, true),
    taskEnabled: parseBoolean(process.env.CRM_AUTOMATION_TASK_ENABLED, true),
    scoreEnabled: parseBoolean(process.env.CRM_AUTOMATION_SCORE_ENABLED, true),
    whatsappMode: getWhatsAppAutomationMode(),
  };
}

function buildEmailTransportConfig() {
  const fromEmail = process.env.OUTREACH_FROM_EMAIL || 'contato@impulsestrategy.com.br';
  const smtpHost = process.env.OUTREACH_SMTP_HOST || 'smtp.hostinger.com';
  const smtpPort = Number(process.env.OUTREACH_SMTP_PORT || 465);
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

function getEmailTransportSignature(config) {
  return JSON.stringify([
    config.smtpHost,
    config.smtpPort,
    config.smtpSecure,
    config.smtpUser,
    Boolean(config.smtpPass),
    config.fromEmail,
    config.replyTo,
  ]);
}

function getEmailTransporter() {
  const config = buildEmailTransportConfig();

  if (!config.smtpUser || !config.smtpPass || !config.smtpHost) {
    throw new Error('SMTP não configurado para automação de e-mail.');
  }

  const signature = getEmailTransportSignature(config);

  if (!cachedTransporter || signature !== cachedTransportSignature) {
    cachedTransporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });

    cachedTransportSignature = signature;
  }

  return {
    transporter: cachedTransporter,
    config,
  };
}

function mapTask(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    company_id: row.company_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    stage: row.stage,
    due_date: row.due_date,
    source: row.source,
    assigned_to: row.assigned_to,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    company: row.company_id
      ? {
          id: row.company_id,
          name: row.company_name,
          phone: row.company_phone,
          city: row.company_city,
          category: row.company_category,
          crm_score: row.company_crm_score,
        }
      : null,
  };
}

function mapPipelineItem(row) {
  return {
    card_id: row.card_id,
    stage: row.stage,
    stage_label: STAGE_LABELS[row.stage] || row.stage,
    notes: row.notes,
    next_action: row.next_action,
    proposal_value: row.proposal_value,
    due_date: row.due_date,
    updated_at: row.updated_at,
    open_tasks: Number(row.open_tasks || 0),
    last_activity_at: row.last_activity_at,
    company: {
      id: row.company_id,
      name: row.company_name,
      phone: row.company_phone,
      city: row.company_city,
      category: row.company_category,
      status_site: row.company_status_site,
      contact_email: row.company_contact_email,
      crm_owner: row.company_crm_owner,
      crm_score: Number(row.company_crm_score || 0),
      contacted: Boolean(row.company_contacted),
    },
  };
}

async function getCompanyById(companyId) {
  const result = await query(
    `
      SELECT
        c.id,
        c.name,
        c.phone,
        c.city,
        c.category,
        c.website,
        c.instagram_url,
        c.status_site,
        c.reviews,
        c.contacted,
        c.contact_email,
        c.crm_owner,
        c.crm_score,
        c.crm_last_interaction_at,
        kc.stage AS kanban_stage
      FROM companies c
      LEFT JOIN kanban_cards kc ON kc.company_id = c.id
      WHERE c.id = $1
      LIMIT 1
    `,
    [Number(companyId)]
  );

  return result.rows[0] || null;
}

async function getCompanyEngagement(companyId) {
  const result = await query(
    `
      SELECT
        COUNT(*) FILTER (WHERE wm.direction = 'inbound')::int AS inbound_count,
        COUNT(*) FILTER (
          WHERE wm.direction = 'outbound'
            AND wm.status IN ('sent', 'delivered', 'read')
        )::int AS outbound_success_count,
        MAX(wm.created_at) AS last_message_at
      FROM whatsapp_messages wm
      INNER JOIN whatsapp_contacts wc ON wc.id = wm.contact_id
      WHERE wc.company_id = $1
    `,
    [Number(companyId)]
  );

  return result.rows[0] || {
    inbound_count: 0,
    outbound_success_count: 0,
    last_message_at: null,
  };
}

async function getCompanyTaskMetrics(companyId) {
  const result = await query(
    `
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress'))::int AS open_tasks,
        MAX(updated_at) AS last_task_at
      FROM crm_tasks
      WHERE company_id = $1
    `,
    [Number(companyId)]
  );

  return result.rows[0] || {
    open_tasks: 0,
    last_task_at: null,
  };
}

function calculateCrmScore({ company, engagement, taskMetrics }) {
  const statusSite = String(company?.status_site || 'sem_site');
  const stage = String(company?.kanban_stage || 'entrada');
  const reviews = Number(company?.reviews || 0);
  const inboundCount = Number(engagement?.inbound_count || 0);
  const outboundSuccessCount = Number(engagement?.outbound_success_count || 0);
  const openTasks = Number(taskMetrics?.open_tasks || 0);

  let score = 0;

  if (statusSite === 'sem_site') {
    score += 45;
  } else if (statusSite === 'site_fraco') {
    score += 30;
  } else {
    score += 18;
  }

  if (!company?.contacted) {
    score += 10;
  }

  if (sanitizeText(company?.phone)) {
    score += 10;
  }

  if (sanitizeText(company?.contact_email)) {
    score += 12;
  }

  if (sanitizeText(company?.instagram_url)) {
    score += 4;
  }

  if (reviews <= 5) {
    score += 10;
  } else if (reviews <= 20) {
    score += 7;
  } else if (reviews <= 60) {
    score += 4;
  }

  if (stage === 'contato') {
    score += 8;
  } else if (stage === 'proposta') {
    score += 14;
  } else if (stage === 'negociacao') {
    score += 20;
  } else if (stage === 'fechado') {
    score += 30;
  } else if (stage === 'perdido') {
    score -= 12;
  }

  score += Math.min(20, inboundCount * 4);
  score += Math.min(10, outboundSuccessCount * 2);
  score += Math.min(8, openTasks * 2);

  return clamp(Math.floor(score), 0, 100);
}

async function updateCompanyCrmScore(companyId) {
  const company = await getCompanyById(companyId);

  if (!company) {
    return null;
  }

  const [engagement, taskMetrics] = await Promise.all([
    getCompanyEngagement(company.id),
    getCompanyTaskMetrics(company.id),
  ]);

  const crmScore = calculateCrmScore({
    company,
    engagement,
    taskMetrics,
  });

  const interactionCandidates = [
    company.crm_last_interaction_at ? new Date(company.crm_last_interaction_at) : null,
    engagement.last_message_at ? new Date(engagement.last_message_at) : null,
    taskMetrics.last_task_at ? new Date(taskMetrics.last_task_at) : null,
  ].filter((value) => value && !Number.isNaN(value.getTime()));

  const crmLastInteractionAt = interactionCandidates.length
    ? new Date(Math.max(...interactionCandidates.map((item) => item.getTime()))).toISOString()
    : null;

  const result = await query(
    `
      UPDATE companies
      SET crm_score = $2,
          crm_last_interaction_at = COALESCE($3::timestamptz, crm_last_interaction_at)
      WHERE id = $1
      RETURNING id, crm_score, crm_last_interaction_at
    `,
    [Number(company.id), crmScore, crmLastInteractionAt]
  );

  return result.rows[0] || null;
}

async function recalculateCrmScores({ companyId, limit } = {}) {
  const normalizedCompanyId = companyId == null ? null : Number(companyId);
  const normalizedLimit = clamp(parseInteger(limit, 0), 0, 5000);

  if (normalizedCompanyId) {
    const updated = await updateCompanyCrmScore(normalizedCompanyId);

    return {
      total: updated ? 1 : 0,
      updated,
    };
  }

  const idsResult = await query(
    `
      SELECT id
      FROM companies
      ORDER BY created_at DESC
      ${normalizedLimit > 0 ? `LIMIT ${normalizedLimit}` : ''}
    `
  );

  let updatedCount = 0;

  for (const row of idsResult.rows) {
    const updated = await updateCompanyCrmScore(row.id);

    if (updated) {
      updatedCount += 1;
    }
  }

  return {
    total: updatedCount,
  };
}

async function logCrmActivity({
  companyId,
  cardId = null,
  activityType,
  channel = 'system',
  title,
  details = null,
  metadata = null,
  createdBy = null,
}) {
  const result = await query(
    `
      INSERT INTO crm_activities (
        company_id,
        card_id,
        activity_type,
        channel,
        title,
        details,
        metadata,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      RETURNING id, company_id, card_id, activity_type, channel, title, details, metadata, created_by, created_at
    `,
    [
      Number(companyId),
      cardId == null ? null : Number(cardId),
      sanitizeText(activityType) || 'event',
      sanitizeText(channel) || 'system',
      sanitizeText(title) || 'Evento CRM',
      sanitizeText(details),
      metadata == null ? null : JSON.stringify(metadata),
      sanitizeText(createdBy),
    ]
  );

  return result.rows[0] || null;
}

async function getCrmTaskById(taskId) {
  const result = await query(
    `
      SELECT
        ct.id,
        ct.company_id,
        ct.title,
        ct.description,
        ct.status,
        ct.priority,
        ct.stage,
        ct.due_date,
        ct.source,
        ct.assigned_to,
        ct.completed_at,
        ct.created_at,
        ct.updated_at,
        c.name AS company_name,
        c.phone AS company_phone,
        c.city AS company_city,
        c.category AS company_category,
        c.crm_score AS company_crm_score
      FROM crm_tasks ct
      INNER JOIN companies c ON c.id = ct.company_id
      WHERE ct.id = $1
      LIMIT 1
    `,
    [Number(taskId)]
  );

  return mapTask(result.rows[0]);
}

async function listCrmTasks({ status, stage, search, limit = 200 } = {}) {
  const filters = [];
  const params = [];

  const normalizedStatus = sanitizeText(status);
  if (normalizedStatus) {
    normalizeTaskStatus(normalizedStatus);
    params.push(normalizedStatus);
    filters.push(`ct.status = $${params.length}`);
  }

  const normalizedStage = sanitizeText(stage);
  if (normalizedStage) {
    normalizeStage(normalizedStage);
    params.push(normalizedStage);
    filters.push(`ct.stage = $${params.length}`);
  }

  const normalizedSearch = sanitizeText(search);
  if (normalizedSearch) {
    params.push(`%${normalizedSearch}%`);
    filters.push(`(
      c.name ILIKE $${params.length}
      OR COALESCE(c.phone, '') ILIKE $${params.length}
      OR ct.title ILIKE $${params.length}
      OR COALESCE(ct.description, '') ILIKE $${params.length}
    )`);
  }

  const safeLimit = clamp(parseInteger(limit, 200), 1, 500);
  params.push(safeLimit);

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await query(
    `
      SELECT
        ct.id,
        ct.company_id,
        ct.title,
        ct.description,
        ct.status,
        ct.priority,
        ct.stage,
        ct.due_date,
        ct.source,
        ct.assigned_to,
        ct.completed_at,
        ct.created_at,
        ct.updated_at,
        c.name AS company_name,
        c.phone AS company_phone,
        c.city AS company_city,
        c.category AS company_category,
        c.crm_score AS company_crm_score
      FROM crm_tasks ct
      INNER JOIN companies c ON c.id = ct.company_id
      ${whereClause}
      ORDER BY
        CASE ct.status
          WHEN 'in_progress' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'done' THEN 3
          WHEN 'canceled' THEN 4
          ELSE 99
        END,
        ct.due_date ASC NULLS LAST,
        ct.updated_at DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows.map(mapTask);
}

async function createCrmTask(payload, options = {}) {
  const companyId = Number(payload?.companyId || payload?.company_id || 0);

  if (!companyId) {
    throw new Error('companyId é obrigatório para criar tarefa CRM.');
  }

  const company = await getCompanyById(companyId);

  if (!company) {
    throw new Error('Empresa não encontrada para criação de tarefa CRM.');
  }

  const title = sanitizeText(payload?.title);

  if (!title) {
    throw new Error('title é obrigatório para criar tarefa CRM.');
  }

  const description = sanitizeText(payload?.description);
  const status = normalizeTaskStatus(payload?.status || 'pending');
  const priority = normalizeTaskPriority(payload?.priority || 'medium');
  const stage = normalizeStage(payload?.stage);
  const dueDate = normalizeDueDate(payload?.due_date || payload?.dueDate);
  const assignedTo = sanitizeText(payload?.assigned_to || payload?.assignedTo || options?.actorUsername || null);
  const source = sanitizeText(payload?.source) === 'automation' ? 'automation' : 'manual';
  const completedAt = status === 'done' ? new Date().toISOString() : null;

  const insertResult = await query(
    `
      INSERT INTO crm_tasks (
        company_id,
        title,
        description,
        status,
        priority,
        stage,
        due_date,
        source,
        assigned_to,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10::timestamptz)
      RETURNING id
    `,
    [
      companyId,
      title,
      description,
      status,
      priority,
      stage,
      dueDate,
      source,
      assignedTo,
      completedAt,
    ]
  );

  const task = await getCrmTaskById(insertResult.rows[0].id);

  if (!options.skipLog) {
    await logCrmActivity({
      companyId,
      activityType: 'task_created',
      channel: 'task',
      title: `Tarefa criada: ${title}`,
      details: description,
      metadata: {
        task_id: task.id,
        status: task.status,
        priority: task.priority,
        stage: task.stage,
        due_date: task.due_date,
        source: task.source,
      },
      createdBy: options.actorUsername || null,
    });
  }

  await updateCompanyCrmScore(companyId);

  return task;
}

async function updateCrmTask(taskId, payload, options = {}) {
  const currentTask = await getCrmTaskById(taskId);

  if (!currentTask) {
    return null;
  }

  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
    const title = sanitizeText(payload.title);

    if (!title) {
      throw new Error('title não pode ser vazio.');
    }

    values.push(title);
    updates.push(`title = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    values.push(sanitizeText(payload.description));
    updates.push(`description = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    const status = normalizeTaskStatus(payload.status);
    values.push(status);
    updates.push(`status = $${values.length}`);

    if (status === 'done') {
      updates.push('completed_at = NOW()');
    } else {
      updates.push('completed_at = NULL');
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'priority')) {
    const priority = normalizeTaskPriority(payload.priority);
    values.push(priority);
    updates.push(`priority = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'stage')) {
    const stage = normalizeStage(payload.stage);
    values.push(stage);
    updates.push(`stage = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'due_date')) {
    const dueDate = normalizeDueDate(payload.due_date);
    values.push(dueDate);
    updates.push(`due_date = $${values.length}::timestamptz`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'assigned_to')) {
    values.push(sanitizeText(payload.assigned_to));
    updates.push(`assigned_to = $${values.length}`);
  }

  if (!updates.length) {
    throw new Error('Nenhum campo válido para atualizar tarefa CRM.');
  }

  updates.push('updated_at = NOW()');
  values.push(Number(taskId));

  const updateResult = await query(
    `
      UPDATE crm_tasks
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING id
    `,
    values
  );

  if (!updateResult.rows[0]) {
    return null;
  }

  const nextTask = await getCrmTaskById(updateResult.rows[0].id);

  if (!options.skipLog) {
    const completedNow = currentTask.status !== 'done' && nextTask.status === 'done';

    await logCrmActivity({
      companyId: nextTask.company_id,
      activityType: completedNow ? 'task_completed' : 'task_updated',
      channel: 'task',
      title: completedNow
        ? `Tarefa concluída: ${nextTask.title}`
        : `Tarefa atualizada: ${nextTask.title}`,
      details: nextTask.description,
      metadata: {
        task_id: nextTask.id,
        status_before: currentTask.status,
        status_after: nextTask.status,
        priority: nextTask.priority,
        stage: nextTask.stage,
        due_date: nextTask.due_date,
      },
      createdBy: options.actorUsername || null,
    });
  }

  await updateCompanyCrmScore(nextTask.company_id);

  return nextTask;
}

async function getCrmOverview() {
  const [
    stageResult,
    totalResult,
    closedResult,
    taskResult,
    scoreResult,
  ] = await Promise.all([
    query(
      `
        SELECT stage, COUNT(*)::int AS total
        FROM kanban_cards
        GROUP BY stage
      `
    ),
    query(
      `
        SELECT COUNT(*)::int AS total_companies
        FROM companies
      `
    ),
    query(
      `
        SELECT
          COUNT(*) FILTER (WHERE stage = 'fechado')::int AS won,
          COUNT(*) FILTER (WHERE stage = 'perdido')::int AS lost
        FROM kanban_cards
      `
    ),
    query(
      `
        SELECT
          COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress'))::int AS open_tasks,
          COUNT(*) FILTER (
            WHERE status IN ('pending', 'in_progress')
              AND due_date IS NOT NULL
              AND due_date < NOW()
          )::int AS overdue_tasks,
          COUNT(*) FILTER (
            WHERE status IN ('pending', 'in_progress')
              AND due_date IS NOT NULL
              AND due_date::date = CURRENT_DATE
          )::int AS due_today,
          COUNT(*) FILTER (
            WHERE status = 'done'
              AND completed_at::date = CURRENT_DATE
          )::int AS done_today
        FROM crm_tasks
      `
    ),
    query(
      `
        SELECT COALESCE(ROUND(AVG(crm_score)::numeric, 2), 0)::float AS avg_crm_score
        FROM companies
      `
    ),
  ]);

  const stages = {
    entrada: 0,
    contato: 0,
    proposta: 0,
    negociacao: 0,
    fechado: 0,
    perdido: 0,
  };

  stageResult.rows.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(stages, row.stage)) {
      stages[row.stage] = Number(row.total || 0);
    }
  });

  const won = Number(closedResult.rows[0]?.won || 0);
  const lost = Number(closedResult.rows[0]?.lost || 0);
  const totalClosed = won + lost;

  return {
    totals: {
      total_companies: Number(totalResult.rows[0]?.total_companies || 0),
      in_pipeline: Object.values(stages).reduce((acc, value) => acc + value, 0),
      won,
      lost,
      win_rate: totalClosed > 0 ? Number(((won / totalClosed) * 100).toFixed(2)) : 0,
      avg_crm_score: Number(scoreResult.rows[0]?.avg_crm_score || 0),
    },
    stages,
    tasks: {
      open: Number(taskResult.rows[0]?.open_tasks || 0),
      overdue: Number(taskResult.rows[0]?.overdue_tasks || 0),
      due_today: Number(taskResult.rows[0]?.due_today || 0),
      done_today: Number(taskResult.rows[0]?.done_today || 0),
    },
    automations: getAutomationConfig(),
  };
}

async function listCrmPipeline({ stage, search, limit = 300 } = {}) {
  const filters = [];
  const params = [];

  const normalizedStage = sanitizeText(stage);
  if (normalizedStage) {
    normalizeStage(normalizedStage);
    params.push(normalizedStage);
    filters.push(`kc.stage = $${params.length}`);
  }

  const normalizedSearch = sanitizeText(search);
  if (normalizedSearch) {
    params.push(`%${normalizedSearch}%`);
    filters.push(`(
      c.name ILIKE $${params.length}
      OR COALESCE(c.phone, '') ILIKE $${params.length}
      OR COALESCE(c.city, '') ILIKE $${params.length}
      OR COALESCE(c.category, '') ILIKE $${params.length}
    )`);
  }

  const safeLimit = clamp(parseInteger(limit, 300), 1, 1000);
  params.push(safeLimit);

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await query(
    `
      SELECT
        kc.id AS card_id,
        kc.company_id,
        kc.stage,
        kc.notes,
        kc.next_action,
        kc.proposal_value,
        kc.due_date,
        kc.updated_at,
        c.id AS company_id,
        c.name AS company_name,
        c.phone AS company_phone,
        c.city AS company_city,
        c.category AS company_category,
        c.status_site AS company_status_site,
        c.contact_email AS company_contact_email,
        c.crm_owner AS company_crm_owner,
        c.crm_score AS company_crm_score,
        c.contacted AS company_contacted,
        COALESCE(task_summary.open_tasks, 0) AS open_tasks,
        GREATEST(
          COALESCE(task_summary.last_task_at, '-infinity'::timestamptz),
          COALESCE(message_summary.last_message_at, '-infinity'::timestamptz),
          kc.updated_at
        ) AS last_activity_at
      FROM kanban_cards kc
      INNER JOIN companies c ON c.id = kc.company_id
      LEFT JOIN (
        SELECT
          company_id,
          COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress'))::int AS open_tasks,
          MAX(updated_at) AS last_task_at
        FROM crm_tasks
        GROUP BY company_id
      ) task_summary ON task_summary.company_id = c.id
      LEFT JOIN (
        SELECT
          wc.company_id,
          MAX(wm.created_at) AS last_message_at
        FROM whatsapp_contacts wc
        INNER JOIN whatsapp_messages wm ON wm.contact_id = wc.id
        GROUP BY wc.company_id
      ) message_summary ON message_summary.company_id = c.id
      ${whereClause}
      ORDER BY ${STAGE_ORDER_SQL}, c.crm_score DESC, kc.updated_at DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows.map(mapPipelineItem);
}

async function listCrmCompanyTimeline({ companyId, limit = 120 } = {}) {
  const normalizedCompanyId = Number(companyId);

  if (!normalizedCompanyId) {
    throw new Error('companyId inválido para timeline do CRM.');
  }

  const safeLimit = clamp(parseInteger(limit, 120), 20, 500);

  const result = await query(
    `
      SELECT
        timeline.id,
        timeline.created_at,
        timeline.channel,
        timeline.activity_type,
        timeline.title,
        timeline.details,
        timeline.metadata
      FROM (
        SELECT
          ('activity-' || ca.id)::text AS id,
          ca.created_at,
          COALESCE(ca.channel, 'system') AS channel,
          ca.activity_type,
          ca.title,
          ca.details,
          COALESCE(ca.metadata, '{}'::jsonb) AS metadata
        FROM crm_activities ca
        WHERE ca.company_id = $1

        UNION ALL

        SELECT
          ('wa-' || wm.id)::text AS id,
          wm.created_at,
          'whatsapp'::text AS channel,
          ('message_' || wm.direction)::text AS activity_type,
          CASE
            WHEN wm.direction = 'inbound' THEN 'Mensagem recebida no WhatsApp'
            ELSE 'Mensagem enviada no WhatsApp'
          END AS title,
          COALESCE(wm.text_body, '[mensagem]') AS details,
          jsonb_build_object(
            'status', wm.status,
            'message_type', wm.message_type,
            'wa_message_id', wm.wa_message_id
          ) AS metadata
        FROM whatsapp_messages wm
        INNER JOIN whatsapp_contacts wc ON wc.id = wm.contact_id
        WHERE wc.company_id = $1

        UNION ALL

        SELECT
          ('task-' || ct.id)::text AS id,
          COALESCE(ct.completed_at, ct.updated_at, ct.created_at) AS created_at,
          'task'::text AS channel,
          CASE
            WHEN ct.status = 'done' THEN 'task_completed'
            ELSE 'task_status'
          END AS activity_type,
          CASE
            WHEN ct.status = 'done' THEN 'Tarefa concluída'
            ELSE 'Tarefa atualizada'
          END AS title,
          ct.title AS details,
          jsonb_build_object(
            'task_id', ct.id,
            'status', ct.status,
            'priority', ct.priority,
            'due_date', ct.due_date,
            'stage', ct.stage,
            'source', ct.source
          ) AS metadata
        FROM crm_tasks ct
        WHERE ct.company_id = $1
      ) timeline
      ORDER BY timeline.created_at DESC
      LIMIT $2
    `,
    [normalizedCompanyId, safeLimit]
  );

  return result.rows;
}

function inferPreferredChannel(company) {
  if (sanitizeText(company?.phone)) {
    return 'whatsapp';
  }

  if (sanitizeText(company?.contact_email)) {
    return 'email';
  }

  return 'task';
}

function normalizeIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

async function suggestCrmNextActions({ companyId, limit = 4 } = {}) {
  const normalizedCompanyId = Number(companyId);

  if (!normalizedCompanyId) {
    throw new Error('companyId inválido para sugestões de próximas ações.');
  }

  const safeLimit = clamp(parseInteger(limit, 4), 1, 10);
  const company = await getCompanyById(normalizedCompanyId);

  if (!company) {
    throw new Error('Empresa não encontrada para sugerir próximas ações.');
  }

  const [engagement, taskMetrics, timeline, openTasksResult] = await Promise.all([
    getCompanyEngagement(normalizedCompanyId),
    getCompanyTaskMetrics(normalizedCompanyId),
    listCrmCompanyTimeline({ companyId: normalizedCompanyId, limit: 30 }),
    query(
      `
        SELECT
          id,
          title,
          priority,
          due_date,
          status,
          stage
        FROM crm_tasks
        WHERE company_id = $1
          AND status IN ('pending', 'in_progress')
        ORDER BY COALESCE(due_date, created_at) ASC
        LIMIT 6
      `,
      [normalizedCompanyId]
    ),
  ]);

  const now = Date.now();
  const stage = String(company.kanban_stage || 'entrada');
  const stageHint = STAGE_NEXT_ACTION_HINTS[stage] || STAGE_NEXT_ACTION_HINTS.entrada;
  const preferredChannel = inferPreferredChannel(company);
  const openTasks = Array.isArray(openTasksResult?.rows) ? openTasksResult.rows : [];
  const overdueTasks = openTasks.filter((task) => {
    if (!task?.due_date) {
      return false;
    }

    const dueAt = new Date(task.due_date).getTime();
    return Number.isFinite(dueAt) && dueAt < now;
  });

  const activityCandidates = [
    company.crm_last_interaction_at,
    engagement.last_message_at,
    taskMetrics.last_task_at,
    timeline[0]?.created_at,
  ]
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter((value) => Number.isFinite(value));

  const lastActivityAt = activityCandidates.length ? Math.max(...activityCandidates) : null;
  const hoursWithoutActivity = lastActivityAt == null
    ? 999
    : Math.max(0, Math.floor((now - lastActivityAt) / (1000 * 60 * 60)));

  const suggestions = [
    {
      key: 'stage_follow_up',
      title: stageHint.title,
      reason: stageHint.reason,
      priority: stage === 'negociacao' ? 'urgent' : 'high',
      channel: preferredChannel,
      due_date: normalizeIsoDate(addDaysToNow(stage === 'negociacao' ? 0 : 1)),
      suggested_message: preferredChannel === 'email'
        ? getStageEmailBody(stage, company)
        : getStageWhatsAppText(stage, company),
    },
  ];

  if (hoursWithoutActivity >= 24) {
    suggestions.push({
      key: 'stale_lead_reactivation',
      title: `Reativar contato após ${hoursWithoutActivity}h sem atividade`,
      reason: 'Lead sem interação recente tende a esfriar rapidamente.',
      priority: hoursWithoutActivity >= 72 ? 'urgent' : 'high',
      channel: preferredChannel,
      due_date: normalizeIsoDate(addDaysToNow(0)),
      suggested_message: preferredChannel === 'email'
        ? `Olá, equipe ${company.name}.\n\nPassando para alinhar o próximo passo do atendimento. Podemos retomar ainda hoje?`
        : `Olá, ${company.name}! Passando para alinharmos o próximo passo da sua demanda. Podemos retomar hoje?`,
    });
  }

  if (overdueTasks.length > 0) {
    suggestions.push({
      key: 'overdue_tasks',
      title: `Regularizar ${overdueTasks.length} tarefa(s) vencida(s)`,
      reason: 'Tarefas vencidas impactam avanço no pipeline e previsibilidade.',
      priority: 'urgent',
      channel: 'task',
      due_date: normalizeIsoDate(addDaysToNow(0)),
      suggested_message: overdueTasks
        .slice(0, 3)
        .map((task) => `- ${task.title}`)
        .join('\n'),
    });
  }

  if (Number(engagement.inbound_count || 0) === 0 && Number(engagement.outbound_success_count || 0) >= 2) {
    suggestions.push({
      key: 'channel_switch',
      title: 'Trocar abordagem de contato (novo gancho)',
      reason: 'Houve tentativas outbound sem resposta inbound; variar ângulo tende a destravar.',
      priority: 'medium',
      channel: preferredChannel,
      due_date: normalizeIsoDate(addDaysToNow(1)),
      suggested_message: preferredChannel === 'email'
        ? `Olá, equipe ${company.name}.\n\nTenho uma recomendação rápida e prática para aumentar os resultados digitais de vocês. Posso compartilhar em 3 pontos?`
        : `Olá, ${company.name}! Tenho uma ideia rápida em 3 pontos para melhorar seus resultados digitais. Quer que eu te envie agora?`,
    });
  }

  if (Number(taskMetrics.open_tasks || 0) === 0) {
    suggestions.push({
      key: 'create_task',
      title: 'Criar tarefa de próximo passo no CRM',
      reason: 'Sem tarefa aberta, o lead pode ficar sem dono e sem cadência.',
      priority: 'high',
      channel: 'task',
      due_date: normalizeIsoDate(addDaysToNow(1)),
      suggested_message: `Definir responsável, canal e horário do próximo contato com ${company.name}.`,
    });
  }

  const uniqueByKey = new Map();

  for (const suggestion of suggestions) {
    if (!uniqueByKey.has(suggestion.key)) {
      uniqueByKey.set(suggestion.key, suggestion);
    }
  }

  return {
    company: {
      id: company.id,
      name: company.name,
      city: company.city,
      category: company.category,
      stage,
      crm_score: Number(company.crm_score || 0),
    },
    context: {
      preferred_channel: preferredChannel,
      hours_without_activity: hoursWithoutActivity,
      inbound_count: Number(engagement.inbound_count || 0),
      outbound_success_count: Number(engagement.outbound_success_count || 0),
      open_tasks: Number(taskMetrics.open_tasks || 0),
      overdue_tasks: overdueTasks.length,
      timeline_events: timeline.length,
    },
    suggestions: Array.from(uniqueByKey.values()).slice(0, safeLimit),
    generated_at: new Date().toISOString(),
    engine: 'crm-heuristic-ai-v1',
  };
}

async function hasOpenAutomationTaskForStage({ companyId, stage, title }) {
  const result = await query(
    `
      SELECT id
      FROM crm_tasks
      WHERE company_id = $1
        AND source = 'automation'
        AND stage = $2
        AND title = $3
        AND status IN ('pending', 'in_progress')
      LIMIT 1
    `,
    [Number(companyId), stage, title]
  );

  return Boolean(result.rows[0]);
}

async function runAutomationTaskForStage({ company, stage, actorUsername }) {
  const rule = DEFAULT_STAGE_TASK_RULES[stage];

  if (!rule) {
    return {
      type: 'task',
      status: 'skipped',
      reason: 'no_rule_for_stage',
    };
  }

  const taskTitle = renderCompanyTemplate(rule.title, company);
  const taskDescription = renderCompanyTemplate(rule.description, company);

  const alreadyOpen = await hasOpenAutomationTaskForStage({
    companyId: company.id,
    stage,
    title: taskTitle,
  });

  if (alreadyOpen) {
    return {
      type: 'task',
      status: 'skipped',
      reason: 'open_task_exists',
      stage,
      title: taskTitle,
    };
  }

  const task = await createCrmTask(
    {
      companyId: company.id,
      title: taskTitle,
      description: taskDescription,
      stage,
      due_date: addDaysToNow(rule.dueDays),
      priority: rule.priority,
      source: 'automation',
      assigned_to: company.crm_owner || actorUsername || null,
    },
    {
      actorUsername,
    }
  );

  return {
    type: 'task',
    status: 'created',
    taskId: task.id,
    stage,
    title: task.title,
    dueDate: task.due_date,
  };
}

async function runAutomationWhatsAppForStage({ company, stage, actorUsername }) {
  const mode = getWhatsAppAutomationMode();

  if (!sanitizeText(company.phone)) {
    return {
      type: 'whatsapp',
      status: 'skipped',
      reason: 'missing_phone',
      stage,
    };
  }

  try {
    let sendResult;
    let templateName = null;
    let textBody = null;

    if (mode === 'template') {
      templateName = getWhatsAppAutomationTemplateName(stage);

      if (!templateName) {
        return {
          type: 'whatsapp',
          status: 'skipped',
          reason: 'missing_template',
          stage,
        };
      }

      sendResult = await sendMetaWhatsAppMessage({
        toPhone: company.phone,
        mode: 'template',
        templateName,
      });
    } else {
      textBody = getStageWhatsAppText(stage, company);

      if (!textBody) {
        return {
          type: 'whatsapp',
          status: 'skipped',
          reason: 'missing_text',
          stage,
        };
      }

      sendResult = await sendMetaWhatsAppMessage({
        toPhone: company.phone,
        mode: 'text',
        message: textBody,
      });
    }

    await saveOutboundToInbox({
      phone: company.phone,
      profileName: company.name || null,
      messageId: sendResult.messageId || null,
      mode,
      templateName,
      textBody,
      rawPayload: sendResult.providerResponse || null,
    });

    await logCrmActivity({
      companyId: company.id,
      activityType: 'automation_whatsapp_sent',
      channel: 'whatsapp',
      title: `Automação WhatsApp enviada (${STAGE_LABELS[stage] || stage})`,
      details: mode === 'template'
        ? `Template utilizado: ${templateName}`
        : textBody,
      metadata: {
        stage,
        mode,
        templateName,
        messageId: sendResult.messageId || null,
        providerStatus: sanitizeText(sendResult?.providerResponse?.messages?.[0]?.message_status) || null,
      },
      createdBy: actorUsername || null,
    });

    const providerStatus = sanitizeText(sendResult?.providerResponse?.messages?.[0]?.message_status) || 'accepted';

    return {
      type: 'whatsapp',
      status: SUCCESS_WHATSAPP_STATUSES.has(providerStatus) ? 'sent' : providerStatus,
      stage,
      mode,
      templateName,
      messageId: sendResult.messageId || null,
      providerStatus,
    };
  } catch (error) {
    await logCrmActivity({
      companyId: company.id,
      activityType: 'automation_whatsapp_failed',
      channel: 'whatsapp',
      title: `Falha na automação WhatsApp (${STAGE_LABELS[stage] || stage})`,
      details: error.message,
      metadata: {
        stage,
        mode,
        statusCode: Number(error.statusCode || 0) || null,
        responseData: error.responseData || null,
      },
      createdBy: actorUsername || null,
    });

    return {
      type: 'whatsapp',
      status: 'failed',
      stage,
      mode,
      error: error.message,
      statusCode: Number(error.statusCode || 0) || null,
    };
  }
}

async function runAutomationEmailForStage({ company, stage, actorUsername }) {
  const toEmail = sanitizeText(company.contact_email);

  if (!toEmail) {
    return {
      type: 'email',
      status: 'skipped',
      reason: 'missing_email',
      stage,
    };
  }

  try {
    const { transporter, config } = getEmailTransporter();
    const subject = getStageEmailSubject(stage, company);
    const textBody = getStageEmailBody(stage, company);

    const result = await transporter.sendMail({
      from: config.fromEmail,
      to: toEmail,
      subject,
      text: textBody,
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    });

    await logCrmActivity({
      companyId: company.id,
      activityType: 'automation_email_sent',
      channel: 'email',
      title: `Automação de e-mail enviada (${STAGE_LABELS[stage] || stage})`,
      details: subject,
      metadata: {
        stage,
        to_email: toEmail,
        message_id: result.messageId || null,
      },
      createdBy: actorUsername || null,
    });

    return {
      type: 'email',
      status: 'sent',
      stage,
      toEmail,
      subject,
      messageId: result.messageId || null,
    };
  } catch (error) {
    await logCrmActivity({
      companyId: company.id,
      activityType: 'automation_email_failed',
      channel: 'email',
      title: `Falha na automação de e-mail (${STAGE_LABELS[stage] || stage})`,
      details: error.message,
      metadata: {
        stage,
        to_email: toEmail,
      },
      createdBy: actorUsername || null,
    });

    return {
      type: 'email',
      status: 'failed',
      stage,
      toEmail,
      error: error.message,
    };
  }
}

async function runCrmStageAutomations({ previousCard, currentCard, actorUsername }) {
  if (!previousCard || !currentCard) {
    return {
      triggered: false,
      reason: 'missing_card_data',
    };
  }

  const previousStage = normalizeStage(previousCard.stage);
  const nextStage = normalizeStage(currentCard.stage);

  if (!previousStage || !nextStage || previousStage === nextStage) {
    return {
      triggered: false,
      reason: 'stage_unchanged',
    };
  }

  const company = await getCompanyById(currentCard.company_id);

  if (!company) {
    return {
      triggered: false,
      reason: 'company_not_found',
    };
  }

  const createdBy = sanitizeText(actorUsername) || 'system';

  await logCrmActivity({
    companyId: company.id,
    cardId: currentCard.id,
    activityType: 'stage_changed',
    channel: 'kanban',
    title: `Etapa alterada: ${STAGE_LABELS[previousStage] || previousStage} → ${STAGE_LABELS[nextStage] || nextStage}`,
    details: sanitizeText(currentCard.next_action) || null,
    metadata: {
      from_stage: previousStage,
      to_stage: nextStage,
      card_id: currentCard.id,
    },
    createdBy,
  });

  const automationConfig = getAutomationConfig();
  const actions = [];

  if (automationConfig.scoreEnabled) {
    const updatedScore = await updateCompanyCrmScore(company.id);

    if (updatedScore) {
      actions.push({
        type: 'score',
        status: 'updated',
        crmScore: Number(updatedScore.crm_score || 0),
      });

      await logCrmActivity({
        companyId: company.id,
        cardId: currentCard.id,
        activityType: 'score_recalculated',
        channel: 'system',
        title: `Score atualizado para ${Number(updatedScore.crm_score || 0)}`,
        metadata: {
          crm_score: Number(updatedScore.crm_score || 0),
        },
        createdBy,
      });
    }
  }

  if (automationConfig.taskEnabled) {
    const taskAction = await runAutomationTaskForStage({
      company,
      stage: nextStage,
      actorUsername: createdBy,
    });

    actions.push(taskAction);
  }

  if (automationConfig.whatsappEnabled) {
    const whatsappAction = await runAutomationWhatsAppForStage({
      company,
      stage: nextStage,
      actorUsername: createdBy,
    });

    actions.push(whatsappAction);
  }

  if (automationConfig.emailEnabled) {
    const emailAction = await runAutomationEmailForStage({
      company,
      stage: nextStage,
      actorUsername: createdBy,
    });

    actions.push(emailAction);
  }

  return {
    triggered: true,
    companyId: company.id,
    cardId: currentCard.id,
    fromStage: previousStage,
    toStage: nextStage,
    actions,
  };
}

module.exports = {
  KANBAN_STAGES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  getCrmOverview,
  listCrmPipeline,
  listCrmTasks,
  createCrmTask,
  updateCrmTask,
  listCrmCompanyTimeline,
  suggestCrmNextActions,
  recalculateCrmScores,
  runCrmStageAutomations,
  updateCompanyCrmScore,
};
