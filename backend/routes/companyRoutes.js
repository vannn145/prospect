const express = require('express');

const {
  collectAndSaveLeads,
} = require('../services/leadCollectorService');
const {
  getCompanies,
  markAsContacted,
  getStats,
  getCompanyById,
} = require('../services/companyRepositoryService');
const {
  enrichCompanyInstagram,
  enrichMissingInstagrams,
} = require('../services/instagramService');
const {
  getKanbanCards,
  addCompanyToKanban,
  updateKanbanCard,
} = require('../services/kanbanService');
const {
  getMetaWhatsAppConfig,
  sendMetaWhatsAppMessage,
  normalizePhoneNumber,
} = require('../services/metaWhatsAppService');
const { saveOutboundToInbox } = require('../services/whatsappInboxService');
const { query } = require('../database/db');

const router = express.Router();

const DEFAULT_BLOCKED_WHATSAPP_ERROR_CODES = ['131049', '131026', '130472'];

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

function normalizeCategoryKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
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

router.get('/companies', async (req, res, next) => {
  try {
    const { status } = req.query;
    const companies = await getCompanies({ status });

    return res.json(companies);
  } catch (error) {
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

    const resolvedMode = mode === 'template' || mode === 'text'
      ? mode
      : getDefaultWhatsAppMode();

    const categoryTemplateName = getTemplateNameByCategory(company.category);
    const resolvedTemplateName = resolvedMode === 'template'
      ? (templateName || categoryTemplateName || process.env.META_WHATSAPP_TEMPLATE_NAME || null)
      : null;

    const blockedFailure = await findRecentBlockedFailure(company.phone);

    if (blockedFailure) {
      const blockedAt = new Date(blockedFailure.createdAt).toLocaleString('pt-BR');
      return res.status(409).json({
        error: `Envio bloqueado para evitar duplicidade: número com falha anterior ${blockedFailure.errorCode} em ${blockedAt}.`,
        blockedFailure,
      });
    }

    const result = await sendMetaWhatsAppMessage({
      toPhone: company.phone,
      message,
      mode: resolvedMode,
      templateName: resolvedTemplateName,
      templateLanguageCode,
      templateParameters,
    });

    await saveOutboundToInbox({
      phone: company.phone,
      profileName: company.name || null,
      messageId: result.messageId || null,
      mode: result.mode,
      templateName: resolvedTemplateName,
      textBody: message || null,
      rawPayload: result.providerResponse || null,
    });

    return res.json({
      message: `Mensagem enviada para ${company.name} com sucesso.`,
      company: {
        id: company.id,
        name: company.name,
        phone: company.phone,
      },
      templateNameUsed: resolvedTemplateName,
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

router.post('/kanban/cards', async (req, res, next) => {
  try {
    const { companyId, stage } = req.body;

    if (!companyId) {
      return res.status(400).json({
        error: 'O campo companyId é obrigatório.',
      });
    }

    const card = await addCompanyToKanban({ companyId, stage });

    return res.json({
      message: 'Empresa incluída no Kanban com sucesso.',
      card,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/kanban/cards/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const card = await updateKanbanCard(id, req.body || {});

    if (!card) {
      return res.status(404).json({
        error: 'Cartão do Kanban não encontrado.',
      });
    }

    return res.json({
      message: 'Cartão atualizado com sucesso.',
      card,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
