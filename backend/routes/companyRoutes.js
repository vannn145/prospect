const express = require('express');

const {
  collectAndSaveLeads,
} = require('../services/leadCollectorService');
const {
  getCompaniesPaginated,
  getCompanyPhonesPaginated,
  markAsContacted,
  getStats,
  getCompanyById,
  createCompanyManual,
} = require('../services/companyRepositoryService');
const {
  enrichCompanyInstagram,
  enrichMissingInstagrams,
} = require('../services/instagramService');
const {
  getKanbanColumns,
  createKanbanColumn,
  deleteKanbanColumn,
  getKanbanCards,
  getKanbanCardById,
  addCompanyToKanban,
  updateKanbanCard,
} = require('../services/kanbanService');
const {
  runCrmStageAutomations,
  updateCompanyCrmScore,
} = require('../services/crmService');
const {
  getMetaWhatsAppConfig,
  sendMetaWhatsAppMessage,
  normalizePhoneNumber,
} = require('../services/metaWhatsAppService');
const { fetchFreePlacesByCityAndCategory } = require('../services/googlePlacesService');
const { saveOutboundToInbox } = require('../services/whatsappInboxService');
const { query } = require('../database/db');

const router = express.Router();

const DEFAULT_BLOCKED_WHATSAPP_ERROR_CODES = ['131026', '130472'];

const WHATSAPP_SUCCESS_STATUSES = new Set(['sent', 'delivered', 'read']);
const WHATSAPP_FAILED_STATUS = 'failed';
const DEFAULT_OPEN_WINDOW_TEXT_TEMPLATE = [
  'Olá, tudo bem?',
  '',
  'Encontrei sua empresa no Google e percebi que vocês ainda não possuem um site profissional ou presença digital forte.',
  '',
  'Hoje muitas empresas estão recebendo novos clientes através do Google e do WhatsApp.',
  '',
  'Trabalho com criação de sites rápidos e integrados ao WhatsApp que ajudam empresas a aparecer mais no Google e gerar mais clientes.',
  '',
  'Se quiser posso te mostrar um exemplo de site para o seu segmento.',
].join('\n');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function getDefaultWhatsAppMode() {
  const mode = String(process.env.META_WHATSAPP_DEFAULT_MODE || 'text').toLowerCase();
  return mode === 'template' ? 'template' : 'text';
}

function normalizeDigits(value) {
  if (value == null) {
    return null;
  }

  const digits = String(value).replace(/\D/g, '').replace(/^0+/, '');
  return digits || null;
}

function isBlockedFailureCheckEnabled() {
  const flag = String(process.env.META_WHATSAPP_BLOCK_ON_FAILED_ENABLED || 'true').toLowerCase();
  return !['false', '0', 'no', 'off'].includes(flag);
}

function getBlockedFailureCodes() {
  const raw = String(process.env.META_WHATSAPP_BLOCK_ON_FAILED_CODES || DEFAULT_BLOCKED_WHATSAPP_ERROR_CODES.join(','));
  const codes = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return codes.length ? codes : DEFAULT_BLOCKED_WHATSAPP_ERROR_CODES;
}

function getBlockedFailureLookbackDays() {
  const parsed = Number(process.env.META_WHATSAPP_BLOCK_FAILED_LOOKBACK_DAYS || 30);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30;
  }

  return Math.floor(parsed);
}

function shouldUseTextInOpenWindow() {
  return parseBoolean(process.env.META_WHATSAPP_USE_TEXT_IN_OPEN_WINDOW, true);
}

function getOpenWindowLookbackHours() {
  const parsed = Number(process.env.META_WHATSAPP_OPEN_WINDOW_LOOKBACK_HOURS || 24);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 24;
  }

  return Math.min(72, Math.floor(parsed));
}

function getPostSendWaitMs() {
  const parsed = Number(process.env.META_WHATSAPP_POST_SEND_WAIT_MS || 30000);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.min(120000, Math.floor(parsed));
}

function getPostSendPollMs() {
  const parsed = Number(process.env.META_WHATSAPP_POST_SEND_POLL_MS || 1500);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1500;
  }

  return Math.min(10000, Math.floor(parsed));
}

function normalizeCategoryKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
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

function resolveOpenWindowTextMessage({ company, requestedMessage }) {
  const normalizedRequested = String(requestedMessage || '').trim();

  if (normalizedRequested) {
    return normalizedRequested;
  }

  const configuredTemplate = String(process.env.META_WHATSAPP_OPEN_WINDOW_TEXT || '').trim();
  const template = configuredTemplate
    ? decodeEscapedNewlines(configuredTemplate)
    : DEFAULT_OPEN_WINDOW_TEXT_TEMPLATE;

  return renderCompanyTemplate(template, company).trim();
}

function getTemplateNameByCategory(category) {
  const raw = String(process.env.META_WHATSAPP_TEMPLATE_BY_CATEGORY || '').trim();

  if (!raw || !category) {
    return null;
  }

  const wantedCategory = normalizeCategoryKey(category);
  if (!wantedCategory) {
    return null;
  }

  const entries = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const separatorIndex = entry.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const categoryKey = normalizeCategoryKey(entry.slice(0, separatorIndex));
    const templateName = entry.slice(separatorIndex + 1).trim();

    if (!templateName) {
      continue;
    }

    if (categoryKey === wantedCategory) {
      return templateName;
    }
  }

  return null;
}

function getTemplateFallbackNames() {
  const raw = String(process.env.META_WHATSAPP_TEMPLATE_FALLBACK_NAMES || '').trim();

  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isEcosystemEngagementBlock(errorCode) {
  return String(errorCode || '').trim() === '131049';
}

function buildPhoneCandidates(phone) {
  const candidates = new Set();
  const normalizedRaw = normalizeDigits(phone);
  const normalizedForSend = normalizePhoneNumber(phone);

  if (normalizedRaw) {
    candidates.add(normalizedRaw);

    if (normalizedRaw.startsWith('55') && normalizedRaw.length > 2) {
      candidates.add(normalizedRaw.slice(2));
    } else {
      candidates.add(`55${normalizedRaw}`);
    }
  }

  if (normalizedForSend) {
    candidates.add(normalizedForSend);

    if (normalizedForSend.startsWith('55') && normalizedForSend.length > 2) {
      candidates.add(normalizedForSend.slice(2));
    } else {
      candidates.add(`55${normalizedForSend}`);
    }
  }

  return [...candidates].filter((value) => value.length >= 10);
}

async function findRecentBlockedFailure(phone) {
  if (!isBlockedFailureCheckEnabled()) {
    return null;
  }

  const phoneCandidates = buildPhoneCandidates(phone);
  if (!phoneCandidates.length) {
    return null;
  }

  const blockedCodes = getBlockedFailureCodes();
  if (!blockedCodes.length) {
    return null;
  }

  const lookbackDays = getBlockedFailureLookbackDays();

  const result = await query(
    `
      SELECT
        wc.wa_id,
        wm.created_at,
        wm.raw_payload->'errors'->0->>'code' AS error_code,
        wm.raw_payload->'errors'->0->>'title' AS error_title,
        wm.raw_payload->'errors'->0->'error_data'->>'details' AS error_details
      FROM whatsapp_messages wm
      INNER JOIN whatsapp_contacts wc ON wc.id = wm.contact_id
      WHERE wm.direction = 'outbound'
        AND wm.status = 'failed'
        AND wc.wa_id = ANY($1::text[])
        AND (wm.raw_payload->'errors'->0->>'code') = ANY($2::text[])
        AND wm.created_at >= NOW() - make_interval(days => $3::int)
      ORDER BY wm.created_at DESC
      LIMIT 1
    `,
    [phoneCandidates, blockedCodes, lookbackDays]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    waId: row.wa_id,
    createdAt: row.created_at,
    errorCode: row.error_code,
    errorTitle: row.error_title,
    errorDetails: row.error_details,
  };
}

async function hasOpenConversationWindow(phone) {
  const phoneCandidates = buildPhoneCandidates(phone);

  if (!phoneCandidates.length) {
    return false;
  }

  const lookbackHours = getOpenWindowLookbackHours();

  const result = await query(
    `
      SELECT 1
      FROM whatsapp_messages wm
      INNER JOIN whatsapp_contacts wc ON wc.id = wm.contact_id
      WHERE wm.direction = 'inbound'
        AND wc.wa_id = ANY($1::text[])
        AND wm.created_at >= NOW() - make_interval(hours => $2::int)
      LIMIT 1
    `,
    [phoneCandidates, lookbackHours]
  );

  return Boolean(result.rows[0]);
}

async function getOutboundMessageStatusByMessageId(messageId) {
  if (!messageId) {
    return null;
  }

  const result = await query(
    `
      SELECT
        wm.status,
        wm.created_at,
        wm.raw_payload->'errors'->0->>'code' AS error_code,
        wm.raw_payload->'errors'->0->>'title' AS error_title,
        wm.raw_payload->'errors'->0->'error_data'->>'details' AS error_details
      FROM whatsapp_messages wm
      WHERE wm.wa_message_id = $1
      LIMIT 1
    `,
    [messageId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    status: String(row.status || '').toLowerCase(),
    createdAt: row.created_at,
    errorCode: row.error_code || null,
    errorTitle: row.error_title || null,
    errorDetails: row.error_details || null,
  };
}

async function waitForOutboundFinalStatus(messageId) {
  const waitMs = getPostSendWaitMs();
  if (!messageId || waitMs <= 0) {
    return null;
  }

  const pollMs = getPostSendPollMs();
  const startedAt = Date.now();
  let latest = await getOutboundMessageStatusByMessageId(messageId);

  while (Date.now() - startedAt < waitMs) {
    if (!latest) {
      await sleep(pollMs);
      latest = await getOutboundMessageStatusByMessageId(messageId);
      continue;
    }

    if (latest.status === WHATSAPP_FAILED_STATUS || WHATSAPP_SUCCESS_STATUSES.has(latest.status)) {
      return latest;
    }

    await sleep(pollMs);
    latest = await getOutboundMessageStatusByMessageId(messageId);
  }

  return latest;
}

async function sendAndTrackOutbound({
  company,
  mode,
  message,
  templateName,
  templateLanguageCode,
  templateParameters,
}) {
  const result = await sendMetaWhatsAppMessage({
    toPhone: company.phone,
    message,
    mode,
    templateName,
    templateLanguageCode,
    templateParameters,
  });

  await saveOutboundToInbox({
    phone: company.phone,
    profileName: company.name || null,
    messageId: result.messageId || null,
    mode: result.mode,
    templateName,
    textBody: mode === 'text' ? message : null,
    rawPayload: result.providerResponse || null,
  });

  const postSendStatus = await waitForOutboundFinalStatus(result.messageId || null);

  return {
    result,
    postSendStatus,
    modeUsed: mode,
    templateNameUsed: templateName,
    textMessageUsed: mode === 'text' ? message : null,
  };
}

router.post('/search', async (req, res, next) => {
  try {
    const { city, category, radius, maxPages, includeInstagram } = req.body;

    if (!city || !category) {
      return res.status(400).json({
        error: 'Os campos city e category são obrigatórios.',
      });
    }

    const result = await collectAndSaveLeads({
      city,
      category,
      radius,
      maxPages,
      includeInstagram,
    });

    return res.json({
      message: 'Busca concluída com sucesso.',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/companies/manual', async (req, res, next) => {
  try {
    const { name, phone, city, category, address, website, status_site } = req.body || {};
    const company = await createCompanyManual({ name, phone, city, category, address, website, status_site });
    return res.status(201).json({ message: 'Cliente cadastrado com sucesso.', company });
  } catch (error) {
    return next(error);
  }
});

router.get('/companies', async (req, res, next) => {
  try {
    const { status, city, category, page, perPage, includeContacted } = req.query;
    const companies = await getCompaniesPaginated({
      status,
      city,
      category,
      page,
      perPage,
      contacted: parseBoolean(includeContacted, true) ? undefined : false,
    });

    return res.json(companies);
  } catch (error) {
    return next(error);
  }
});

router.get('/companies/phones', async (req, res, next) => {
  try {
    const {
      status,
      city,
      category,
      page,
      perPage,
      includeContacted,
      onlyWithPhone,
    } = req.query;

    const phones = await getCompanyPhonesPaginated({
      status,
      city,
      category,
      page,
      perPage,
      contacted: parseBoolean(includeContacted, true) ? undefined : false,
      onlyWithPhone: parseBoolean(onlyWithPhone, true),
    });

    return res.json(phones);
  } catch (error) {
    return next(error);
  }
});

router.get('/companies/phones/live', async (req, res, next) => {
  try {
    const {
      city,
      category,
      radius,
      maxPages,
      onlyWithPhone,
      limit,
    } = req.query;

    if (!city || !category) {
      return res.status(400).json({
        error: 'Os campos city e category são obrigatórios.',
      });
    }

    const places = await fetchFreePlacesByCityAndCategory({
      city: String(city).trim(),
      category: String(category).trim(),
      radius: Number(radius || 5000),
      maxPages: Number(maxPages || 3),
    });

    const mustHavePhone = parseBoolean(onlyWithPhone, true);
    const maxItems = Math.max(1, Math.min(Number(limit || 200), 500));

    const items = places
      .filter((place) => !mustHavePhone || Boolean(normalizeDigits(place.phone_number)))
      .slice(0, maxItems)
      .map((place) => ({
        name: place.name,
        phone: place.phone_number || null,
        phone_digits: normalizeDigits(place.phone_number),
        city: place.city,
        category: place.category,
        address: place.address || null,
        website: place.website || null,
        place_id: place.place_id,
        source: place.source || 'osm',
        latitude: place.latitude ?? null,
        longitude: place.longitude ?? null,
      }));

    return res.json({
      provider: 'openstreetmap',
      updatedAt: new Date().toISOString(),
      total: items.length,
      items,
    });
  } catch (error) {
    error.statusCode = Number(error.statusCode) || 502;
    return next(error);
  }
});

router.post('/contacted/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const company = await markAsContacted(id);

    if (!company) {
      return res.status(404).json({
        error: 'Empresa não encontrada.',
      });
    }

    return res.json({
      message: 'Empresa marcada como contatada.',
      company,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/companies/:id/instagram/enrich', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await enrichCompanyInstagram(id);

    return res.json({
      message: result.found
        ? 'Instagram encontrado com sucesso.'
        : 'Instagram não encontrado para esta empresa.',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/instagram/enrich', async (req, res, next) => {
  try {
    const { limit } = req.body || {};
    const result = await enrichMissingInstagrams(limit);

    return res.json({
      message: `Busca de Instagram concluída. ${result.updated} perfil(is) encontrado(s).`,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/whatsapp/meta/config', (req, res) => {
  const config = getMetaWhatsAppConfig();
  return res.json(config);
});

router.post('/companies/:id/whatsapp/send', async (req, res, next) => {
  try {
    const { id } = req.params;
    const company = await getCompanyById(id);

    if (!company) {
      return res.status(404).json({
        error: 'Empresa não encontrada.',
      });
    }

    if (!company.phone) {
      return res.status(400).json({
        error: 'Empresa sem telefone cadastrado para envio via WhatsApp.',
      });
    }

    const {
      message,
      mode,
      templateName,
      templateLanguageCode,
      templateParameters,
    } = req.body || {};

    const requestedMessage = String(message || '').trim();

    let resolvedMode = mode === 'template' || mode === 'text'
      ? mode
      : getDefaultWhatsAppMode();

    const categoryTemplateName = getTemplateNameByCategory(company.category);
    let resolvedTemplateName = resolvedMode === 'template'
      ? (templateName || categoryTemplateName || process.env.META_WHATSAPP_TEMPLATE_NAME || null)
      : null;

    let resolvedMessage = requestedMessage;
    let openWindowDetected = false;
    let openWindowFallbackUsed = false;

    if (resolvedMode === 'template' && shouldUseTextInOpenWindow()) {
      openWindowDetected = await hasOpenConversationWindow(company.phone);

      if (openWindowDetected) {
        resolvedMode = 'text';
        resolvedTemplateName = null;
        resolvedMessage = resolveOpenWindowTextMessage({
          company,
          requestedMessage,
        });
        openWindowFallbackUsed = true;
      }
    }

    const blockedFailure = resolvedMode === 'template'
      ? await findRecentBlockedFailure(company.phone)
      : null;

    if (blockedFailure) {
      const blockedAt = new Date(blockedFailure.createdAt).toLocaleString('pt-BR');
      return res.status(409).json({
        error: `Envio bloqueado para evitar duplicidade: número com falha anterior ${blockedFailure.errorCode} em ${blockedAt}.`,
        blockedFailure,
      });
    }

    const attempts = [];

    let sendOutcome = await sendAndTrackOutbound({
      company,
      mode: resolvedMode,
      message: resolvedMessage,
      templateName: resolvedTemplateName,
      templateLanguageCode,
      templateParameters,
    });

    attempts.push({
      modeUsed: sendOutcome.modeUsed,
      templateNameUsed: sendOutcome.templateNameUsed,
      messageId: sendOutcome.result?.messageId || null,
      deliveryStatus: sendOutcome.postSendStatus || null,
    });

    if (
      sendOutcome.modeUsed === 'template'
      && sendOutcome.postSendStatus?.status === WHATSAPP_FAILED_STATUS
      && isEcosystemEngagementBlock(sendOutcome.postSendStatus?.errorCode)
    ) {
      const fallbackTemplateNames = getTemplateFallbackNames().filter(
        (name) => name !== sendOutcome.templateNameUsed
      );

      for (const fallbackTemplateName of fallbackTemplateNames) {
        const fallbackOutcome = await sendAndTrackOutbound({
          company,
          mode: 'template',
          message: resolvedMessage,
          templateName: fallbackTemplateName,
          templateLanguageCode,
          templateParameters,
        });

        attempts.push({
          modeUsed: fallbackOutcome.modeUsed,
          templateNameUsed: fallbackOutcome.templateNameUsed,
          messageId: fallbackOutcome.result?.messageId || null,
          deliveryStatus: fallbackOutcome.postSendStatus || null,
        });

        sendOutcome = fallbackOutcome;

        const fallbackFailed = fallbackOutcome.postSendStatus?.status === WHATSAPP_FAILED_STATUS;
        if (!fallbackFailed) {
          break;
        }

        if (!isEcosystemEngagementBlock(fallbackOutcome.postSendStatus?.errorCode)) {
          break;
        }
      }
    }

    const postSendStatus = sendOutcome.postSendStatus;
    const result = sendOutcome.result;
    const finalModeUsed = sendOutcome.modeUsed;
    const finalTemplateNameUsed = sendOutcome.templateNameUsed;
    const finalTextMessageUsed = sendOutcome.textMessageUsed;

    if (postSendStatus?.status === WHATSAPP_FAILED_STATUS) {
      const failedCodeText = postSendStatus.errorCode ? ` (${postSendStatus.errorCode})` : '';
      const failedReason = postSendStatus.errorDetails || postSendStatus.errorTitle || 'Falha retornada pela Meta.';

      return res.status(422).json({
        error: `Meta não entregou a mensagem${failedCodeText}: ${failedReason}`,
        deliveryStatus: postSendStatus,
        company: {
          id: company.id,
          name: company.name,
          phone: company.phone,
        },
        modeUsed: finalModeUsed,
        openWindowDetected,
        openWindowFallbackUsed,
        textMessageUsed: finalTextMessageUsed,
        templateNameUsed: finalTemplateNameUsed,
        attempts,
      });
    }

    return res.json({
      message: `Mensagem enviada para ${company.name} com sucesso.`,
      company: {
        id: company.id,
        name: company.name,
        phone: company.phone,
      },
      modeUsed: finalModeUsed,
      openWindowDetected,
      openWindowFallbackUsed,
      textMessageUsed: finalTextMessageUsed,
      templateNameUsed: finalTemplateNameUsed,
      attempts,
      deliveryStatus: postSendStatus,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    const stats = await getStats();
    return res.json(stats);
  } catch (error) {
    return next(error);
  }
});

router.get('/kanban/cards', async (req, res, next) => {
  try {
    const cards = await getKanbanCards();
    return res.json(cards);
  } catch (error) {
    return next(error);
  }
});

router.get('/kanban/columns', async (req, res, next) => {
  try {
    const columns = await getKanbanColumns();
    return res.json({ columns });
  } catch (error) {
    return next(error);
  }
});

router.post('/kanban/columns', async (req, res, next) => {
  try {
    const column = await createKanbanColumn(req.body || {});
    return res.status(201).json({
      message: 'Coluna criada com sucesso.',
      column,
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/kanban/columns/:key', async (req, res, next) => {
  try {
    const result = await deleteKanbanColumn(req.params.key);
    return res.json({
      message: 'Coluna excluída com sucesso.',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/kanban/cards', async (req, res, next) => {
  try {
    const { companyId, stage } = req.body;

    if (!companyId) {
      return res.status(400).json({
        error: 'O campo companyId é obrigatório.',
      });
    }

    const card = await addCompanyToKanban({ companyId, stage });

    let scoreSnapshot = null;

    try {
      scoreSnapshot = await updateCompanyCrmScore(card.company_id);
    } catch (error) {
      console.error('Falha ao atualizar score CRM ao criar card:', error);
    }

    return res.json({
      message: 'Empresa incluída no Kanban com sucesso.',
      card,
      scoreSnapshot,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/kanban/cards/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const previousCard = await getKanbanCardById(id);
    const card = await updateKanbanCard(id, req.body || {});

    if (!card) {
      return res.status(404).json({
        error: 'Cartão do Kanban não encontrado.',
      });
    }

    let crmAutomation = null;

    try {
      crmAutomation = await runCrmStageAutomations({
        previousCard,
        currentCard: card,
        actorUsername: req.user?.username || null,
      });
    } catch (automationError) {
      console.error('Falha ao executar automações CRM da etapa:', automationError);

      crmAutomation = {
        triggered: false,
        reason: 'automation_error',
        error: automationError.message,
      };
    }

    return res.json({
      message: 'Cartão atualizado com sucesso.',
      card,
      crmAutomation,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
