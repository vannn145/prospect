const { query } = require('../database/db');
const { sendMetaWhatsAppMessage } = require('./metaWhatsAppService');

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

const ALLOWED_CONTACT_TAGS = new Set([
  'novo_contato',
  'prospeccao_sem_resposta',
  'primeiro_contato_sem_resposta',
  'segundo_contato_sem_resposta',
  'aguardando_resposta',
  'respondeu',
  'interessado',
  'sem_interesse',
  'fechado',
]);

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function sanitizeText(value) {
  if (value == null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed || null;
}

function buildHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeWaId(value) {
  if (value == null) {
    return null;
  }

  const digits = String(value).replace(/\D/g, '');
  return digits || null;
}

function buildPhoneCandidates(waId) {
  const normalized = normalizeWaId(waId);
  if (!normalized) {
    return [];
  }

  const candidates = new Set([normalized]);

  if (normalized.startsWith('55') && normalized.length > 2) {
    candidates.add(normalized.slice(2));
  } else {
    candidates.add(`55${normalized}`);
  }

  return [...candidates].filter((value) => value.length >= 10);
}

function extractIncomingText(message) {
  const type = sanitizeText(message?.type) || 'unknown';

  if (type === 'text') {
    return sanitizeText(message?.text?.body) || '[mensagem]';
  }

  if (type === 'button') {
    return sanitizeText(message?.button?.text) || '[botão]';
  }

  if (type === 'interactive') {
    const interactive = message?.interactive || {};

    if (interactive?.type === 'button_reply') {
      return (
        sanitizeText(interactive?.button_reply?.title)
        || sanitizeText(interactive?.button_reply?.id)
        || '[resposta interativa]'
      );
    }

    if (interactive?.type === 'list_reply') {
      return (
        sanitizeText(interactive?.list_reply?.title)
        || sanitizeText(interactive?.list_reply?.id)
        || '[resposta interativa]'
      );
    }

    return '[interativo]';
  }

  if (type === 'image') {
    return sanitizeText(message?.image?.caption) || '[imagem]';
  }

  if (type === 'document') {
    return sanitizeText(message?.document?.filename) || '[documento]';
  }

  if (type === 'audio') {
    return '[áudio]';
  }

  if (type === 'video') {
    return sanitizeText(message?.video?.caption) || '[vídeo]';
  }

  return `[${type}]`;
}

function buildPreview(text) {
  const normalized = sanitizeText(text);

  if (!normalized) {
    return '[mensagem]';
  }

  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
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

function resolveOpenWindowTextMessage(company) {
  const configuredTemplate = String(process.env.META_WHATSAPP_OPEN_WINDOW_TEXT || '').trim();
  const template = configuredTemplate
    ? decodeEscapedNewlines(configuredTemplate)
    : DEFAULT_OPEN_WINDOW_TEXT_TEMPLATE;

  return renderCompanyTemplate(template, company).trim();
}

function isAutoRetryOnInboundEnabled() {
  return parseBoolean(process.env.META_WHATSAPP_AUTO_RETRY_ON_INBOUND_ENABLED, true);
}

function getAutoRetryLookbackHours() {
  const parsed = Number(process.env.META_WHATSAPP_AUTO_RETRY_LOOKBACK_HOURS || 168);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 168;
  }

  return Math.min(720, Math.floor(parsed));
}

function getAutoRetryFailedCodes() {
  const raw = String(process.env.META_WHATSAPP_AUTO_RETRY_FAILED_CODES || '131049');

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function mapConversation(row) {
  if (!row) {
    return null;
  }

  const displayName = row.profile_name || row.company_name || row.wa_id;

  return {
    id: row.id,
    wa_id: row.wa_id,
    profile_name: row.profile_name,
    display_name: displayName,
    phone_display: row.phone_display || row.wa_id,
    contact_tag: sanitizeText(row.contact_tag),
    contact_tag_updated_at: row.contact_tag_updated_at || null,
    unread_count: Number(row.unread_count || 0),
    last_message_at: row.last_message_at,
    last_message_preview: row.last_message_preview,
    created_at: row.created_at,
    updated_at: row.updated_at,
    company: row.company_id
      ? {
          id: row.company_id,
          name: row.company_name,
          phone: row.company_phone,
          city: row.company_city,
        }
      : null,
  };
}

function normalizeContactTag(tag) {
  const normalized = sanitizeText(tag);

  if (!normalized) {
    return null;
  }

  if (!ALLOWED_CONTACT_TAGS.has(normalized)) {
    throw buildHttpError('Tag de contato inválida.', 400);
  }

  return normalized;
}

function mapMessage(row) {
  return {
    id: row.id,
    wa_message_id: row.wa_message_id,
    direction: row.direction,
    message_type: row.message_type,
    text_body: row.text_body,
    status: row.status,
    created_at: row.created_at,
  };
}

async function findCompanyByWaId(waId) {
  const candidates = buildPhoneCandidates(waId);

  if (!candidates.length) {
    return null;
  }

  const placeholders = candidates.map((_, index) => `$${index + 1}`).join(', ');

  const result = await query(
    `
      SELECT id, name, phone, city, category
      FROM companies
      WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') IN (${placeholders})
      ORDER BY contacted ASC, created_at DESC
      LIMIT 1
    `,
    candidates
  );

  return result.rows[0] || null;
}

async function findCompanyById(companyId) {
  if (!companyId) {
    return null;
  }

  const result = await query(
    `
      SELECT id, name, phone, city, category
      FROM companies
      WHERE id = $1
      LIMIT 1
    `,
    [Number(companyId)]
  );

  return result.rows[0] || null;
}

async function findLatestRetryableFailure(contactId) {
  const failedCodes = getAutoRetryFailedCodes();

  if (!failedCodes.length) {
    return null;
  }

  const lookbackHours = getAutoRetryLookbackHours();

  const result = await query(
    `
      SELECT
        wm.id,
        wm.created_at,
        wm.raw_payload->'errors'->0->>'code' AS error_code,
        wm.raw_payload->'errors'->0->>'title' AS error_title,
        wm.raw_payload->'errors'->0->'error_data'->>'details' AS error_details
      FROM whatsapp_messages wm
      WHERE wm.contact_id = $1
        AND wm.direction = 'outbound'
        AND wm.status = 'failed'
        AND (wm.raw_payload->'errors'->0->>'code') = ANY($2::text[])
        AND wm.created_at >= NOW() - make_interval(hours => $3::int)
      ORDER BY wm.created_at DESC, wm.id DESC
      LIMIT 1
    `,
    [Number(contactId), failedCodes, lookbackHours]
  );

  return result.rows[0] || null;
}

async function hasInboundAutoRetryForFailure(contactId, failedMessageId) {
  const result = await query(
    `
      SELECT 1
      FROM whatsapp_messages wm
      WHERE wm.contact_id = $1
        AND wm.direction = 'outbound'
        AND wm.raw_payload->'auto_retry'->>'source' = 'inbound_open_window'
        AND wm.raw_payload->'auto_retry'->>'failed_message_id' = $2
      LIMIT 1
    `,
    [Number(contactId), String(failedMessageId)]
  );

  return Boolean(result.rows[0]);
}

async function maybeAutoRetryFailedMessageOnInbound({ contact, inboundMessageId }) {
  if (!isAutoRetryOnInboundEnabled()) {
    return {
      retried: false,
      reason: 'disabled',
    };
  }

  if (!contact?.id || !contact?.wa_id) {
    return {
      retried: false,
      reason: 'invalid_contact',
    };
  }

  const failedMessage = await findLatestRetryableFailure(contact.id);

  if (!failedMessage) {
    return {
      retried: false,
      reason: 'no_retryable_failure',
    };
  }

  const alreadyRetried = await hasInboundAutoRetryForFailure(contact.id, failedMessage.id);

  if (alreadyRetried) {
    return {
      retried: false,
      reason: 'already_retried',
    };
  }

  const company = contact.company_id
    ? (await findCompanyById(contact.company_id))
    : (await findCompanyByWaId(contact.wa_id));

  const retryText = resolveOpenWindowTextMessage(company);

  if (!retryText) {
    return {
      retried: false,
      reason: 'empty_retry_text',
    };
  }

  const providerResult = await sendMetaWhatsAppMessage({
    toPhone: contact.wa_id,
    message: retryText,
    mode: 'text',
  });

  const providerStatus = sanitizeText(providerResult?.providerResponse?.messages?.[0]?.message_status) || 'accepted';

  const autoRetryPayload = {
    ...(providerResult.providerResponse || providerResult || {}),
    auto_retry: {
      source: 'inbound_open_window',
      failed_message_id: String(failedMessage.id),
      failed_error_code: failedMessage.error_code || null,
      failed_error_title: failedMessage.error_title || null,
      failed_error_details: failedMessage.error_details || null,
      inbound_message_id: sanitizeText(inboundMessageId) || null,
      triggered_at: new Date().toISOString(),
    },
  };

  await storeMessage({
    contactId: contact.id,
    waMessageId: providerResult.messageId || null,
    direction: 'outbound',
    messageType: 'text',
    textBody: retryText,
    status: providerStatus,
    rawPayload: autoRetryPayload,
  });

  await updateConversationSnapshot({
    contactId: contact.id,
    previewText: retryText,
    unreadDelta: 0,
  });

  return {
    retried: true,
    messageId: providerResult.messageId || null,
    status: providerStatus,
  };
}

async function ensureContact({ waId, profileName }) {
  const normalizedWaId = normalizeWaId(waId);

  if (!normalizedWaId) {
    throw buildHttpError('waId inválido.', 400);
  }

  const existingResult = await query(
    `
      SELECT id, wa_id, company_id
      FROM whatsapp_contacts
      WHERE wa_id = $1
      LIMIT 1
    `,
    [normalizedWaId]
  );

  const linkedCompany = await findCompanyByWaId(normalizedWaId);

  if (existingResult.rows[0]) {
    const existing = existingResult.rows[0];

    const updatedResult = await query(
      `
        UPDATE whatsapp_contacts
        SET profile_name = COALESCE($2, profile_name),
            phone_display = COALESCE($3, phone_display),
            company_id = COALESCE(company_id, $4),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        Number(existing.id),
        sanitizeText(profileName),
        normalizedWaId,
        linkedCompany?.id || null,
      ]
    );

    return updatedResult.rows[0];
  }

  const insertedResult = await query(
    `
      INSERT INTO whatsapp_contacts (
        wa_id,
        profile_name,
        phone_display,
        company_id,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `,
    [
      normalizedWaId,
      sanitizeText(profileName),
      normalizedWaId,
      linkedCompany?.id || null,
    ]
  );

  return insertedResult.rows[0];
}

async function fetchConversationByWaId(waId) {
  const normalizedWaId = normalizeWaId(waId);

  if (!normalizedWaId) {
    return null;
  }

  const result = await query(
    `
      SELECT
        wc.id,
        wc.wa_id,
        wc.profile_name,
        wc.phone_display,
        wc.contact_tag,
        wc.contact_tag_updated_at,
        wc.unread_count,
        wc.last_message_at,
        wc.last_message_preview,
        wc.created_at,
        wc.updated_at,
        c.id AS company_id,
        c.name AS company_name,
        c.phone AS company_phone,
        c.city AS company_city
      FROM whatsapp_contacts wc
      LEFT JOIN companies c ON c.id = wc.company_id
      WHERE wc.wa_id = $1
      LIMIT 1
    `,
    [normalizedWaId]
  );

  return mapConversation(result.rows[0]);
}

async function storeMessage({
  contactId,
  waMessageId,
  direction,
  messageType,
  textBody,
  status,
  rawPayload,
}) {
  const normalizedMessageId = sanitizeText(waMessageId);
  const normalizedText = sanitizeText(textBody) || '[mensagem]';
  const normalizedStatus = sanitizeText(status) || 'received';
  const normalizedMessageType = sanitizeText(messageType) || 'text';
  const payloadValue = rawPayload == null ? null : JSON.stringify(rawPayload);

  if (normalizedMessageId) {
    const insertResult = await query(
      `
        INSERT INTO whatsapp_messages (
          contact_id,
          wa_message_id,
          direction,
          message_type,
          text_body,
          status,
          raw_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (wa_message_id) DO NOTHING
        RETURNING id, wa_message_id, direction, message_type, text_body, status, created_at
      `,
      [
        Number(contactId),
        normalizedMessageId,
        direction,
        normalizedMessageType,
        normalizedText,
        normalizedStatus,
        payloadValue,
      ]
    );

    if (insertResult.rows[0]) {
      return {
        inserted: true,
        message: mapMessage(insertResult.rows[0]),
      };
    }

    const existingResult = await query(
      `
        SELECT id, wa_message_id, direction, message_type, text_body, status, created_at
        FROM whatsapp_messages
        WHERE wa_message_id = $1
        LIMIT 1
      `,
      [normalizedMessageId]
    );

    return {
      inserted: false,
      message: existingResult.rows[0] ? mapMessage(existingResult.rows[0]) : null,
    };
  }

  const fallbackResult = await query(
    `
      INSERT INTO whatsapp_messages (
        contact_id,
        wa_message_id,
        direction,
        message_type,
        text_body,
        status,
        raw_payload
      )
      VALUES ($1, NULL, $2, $3, $4, $5, $6::jsonb)
      RETURNING id, wa_message_id, direction, message_type, text_body, status, created_at
    `,
    [
      Number(contactId),
      direction,
      normalizedMessageType,
      normalizedText,
      normalizedStatus,
      payloadValue,
    ]
  );

  return {
    inserted: true,
    message: mapMessage(fallbackResult.rows[0]),
  };
}

async function updateConversationSnapshot({ contactId, previewText, unreadDelta = 0 }) {
  await query(
    `
      UPDATE whatsapp_contacts
      SET last_message_at = NOW(),
          last_message_preview = $2,
          unread_count = GREATEST(0, unread_count + $3),
          updated_at = NOW()
      WHERE id = $1
    `,
    [
      Number(contactId),
      buildPreview(previewText),
      Number(unreadDelta || 0),
    ]
  );
}

async function listInboxConversations({ search } = {}) {
  const normalizedSearch = sanitizeText(search);
  const params = [];
  const filters = [];

  if (normalizedSearch) {
    params.push(`%${normalizedSearch}%`);
    filters.push(`(
      wc.wa_id ILIKE $${params.length}
      OR COALESCE(wc.profile_name, '') ILIKE $${params.length}
      OR COALESCE(c.name, '') ILIKE $${params.length}
    )`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await query(
    `
      SELECT
        wc.id,
        wc.wa_id,
        wc.profile_name,
        wc.phone_display,
        wc.contact_tag,
        wc.contact_tag_updated_at,
        wc.unread_count,
        wc.last_message_at,
        wc.last_message_preview,
        wc.created_at,
        wc.updated_at,
        c.id AS company_id,
        c.name AS company_name,
        c.phone AS company_phone,
        c.city AS company_city
      FROM whatsapp_contacts wc
      LEFT JOIN companies c ON c.id = wc.company_id
      ${whereClause}
      ORDER BY wc.last_message_at DESC NULLS LAST, wc.updated_at DESC, wc.id DESC
      LIMIT 300
    `,
    params
  );

  return result.rows.map(mapConversation);
}

async function getInboxConversationMessages({ waId, limit = 120 } = {}) {
  const normalizedWaId = normalizeWaId(waId);

  if (!normalizedWaId) {
    throw buildHttpError('waId inválido.', 400);
  }

  const conversation = await fetchConversationByWaId(normalizedWaId);

  if (!conversation) {
    return null;
  }

  const parsedLimit = Number(limit || 120);
  const safeLimit = Number.isNaN(parsedLimit)
    ? 120
    : Math.min(500, Math.max(20, parsedLimit));

  const result = await query(
    `
      SELECT id, wa_message_id, direction, message_type, text_body, status, created_at
      FROM whatsapp_messages
      WHERE contact_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [Number(conversation.id), safeLimit]
  );

  return {
    conversation,
    messages: result.rows.reverse().map(mapMessage),
  };
}

async function markConversationAsRead({ waId }) {
  const normalizedWaId = normalizeWaId(waId);

  if (!normalizedWaId) {
    throw buildHttpError('waId inválido.', 400);
  }

  const result = await query(
    `
      UPDATE whatsapp_contacts
      SET unread_count = 0
      WHERE wa_id = $1
      RETURNING id
    `,
    [normalizedWaId]
  );

  return Boolean(result.rows[0]);
}

async function updateConversationTag({ waId, tag }) {
  const normalizedWaId = normalizeWaId(waId);

  if (!normalizedWaId) {
    throw buildHttpError('waId inválido.', 400);
  }

  const normalizedTag = normalizeContactTag(tag);

  const result = await query(
    `
      UPDATE whatsapp_contacts
      SET contact_tag = $2::text,
          contact_tag_updated_at = CASE WHEN $2::text IS NULL THEN NULL ELSE NOW() END,
          updated_at = NOW()
      WHERE wa_id = $1
      RETURNING id
    `,
    [normalizedWaId, normalizedTag]
  );

  if (!result.rows[0]) {
    return null;
  }

  return fetchConversationByWaId(normalizedWaId);
}

async function sendConversationReply({ waId, message }) {
  const normalizedWaId = normalizeWaId(waId);

  if (!normalizedWaId) {
    throw buildHttpError('waId inválido.', 400);
  }

  const normalizedMessage = sanitizeText(message);

  if (!normalizedMessage) {
    throw buildHttpError('Mensagem vazia.', 400);
  }

  const contact = await ensureContact({ waId: normalizedWaId });

  const providerResult = await sendMetaWhatsAppMessage({
    toPhone: normalizedWaId,
    message: normalizedMessage,
    mode: 'text',
  });

  const providerStatus = sanitizeText(providerResult?.providerResponse?.messages?.[0]?.message_status) || 'accepted';

  const stored = await storeMessage({
    contactId: contact.id,
    waMessageId: providerResult.messageId,
    direction: 'outbound',
    messageType: 'text',
    textBody: normalizedMessage,
    status: providerStatus,
    rawPayload: providerResult.providerResponse || providerResult,
  });

  await updateConversationSnapshot({
    contactId: contact.id,
    previewText: normalizedMessage,
    unreadDelta: 0,
  });

  const conversation = await fetchConversationByWaId(normalizedWaId);

  return {
    conversation,
    message: stored.message,
    providerResult,
  };
}

async function processMetaWebhookPayload(payload) {
  if (!payload || !Array.isArray(payload.entry)) {
    return {
      inboundStored: 0,
      statusesUpdated: 0,
      autoRetried: 0,
    };
  }

  let inboundStored = 0;
  let statusesUpdated = 0;
  let autoRetried = 0;

  for (const entry of payload.entry) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change?.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];

      const profileNamesByWaId = new Map();

      for (const contact of contacts) {
        const contactWaId = normalizeWaId(contact?.wa_id);

        if (!contactWaId) {
          continue;
        }

        profileNamesByWaId.set(contactWaId, sanitizeText(contact?.profile?.name));
      }

      for (const message of messages) {
        try {
          const fromWaId = normalizeWaId(message?.from);

          if (!fromWaId) {
            continue;
          }

          const profileName = profileNamesByWaId.get(fromWaId) || null;
          const contact = await ensureContact({
            waId: fromWaId,
            profileName,
          });

          const extractedText = extractIncomingText(message);
          const messageType = sanitizeText(message?.type) || 'text';

          const stored = await storeMessage({
            contactId: contact.id,
            waMessageId: message?.id,
            direction: 'inbound',
            messageType,
            textBody: extractedText,
            status: 'received',
            rawPayload: message,
          });

          if (stored.inserted) {
            inboundStored += 1;

            await updateConversationSnapshot({
              contactId: contact.id,
              previewText: extractedText,
              unreadDelta: 1,
            });

            const retryResult = await maybeAutoRetryFailedMessageOnInbound({
              contact,
              inboundMessageId: message?.id,
            });

            if (retryResult?.retried) {
              autoRetried += 1;
            }
          }
        } catch (error) {
          console.error('Erro ao processar mensagem inbound da Meta:', error);
        }
      }

      for (const statusPayload of statuses) {
        const statusMessageId = sanitizeText(statusPayload?.id);
        const statusValue = sanitizeText(statusPayload?.status) || 'updated';

        if (!statusMessageId) {
          continue;
        }

        const result = await query(
          `
            UPDATE whatsapp_messages
            SET status = $2,
                raw_payload = COALESCE(raw_payload, '{}'::jsonb) || $3::jsonb
            WHERE wa_message_id = $1
          `,
          [
            statusMessageId,
            statusValue,
            JSON.stringify(statusPayload),
          ]
        );

        statusesUpdated += result.rowCount;
      }
    }
  }

  return {
    inboundStored,
    statusesUpdated,
    autoRetried,
  };
}

async function saveOutboundToInbox({ phone, profileName, messageId, mode, templateName, textBody, rawPayload }) {
  try {
    const normalizedWaId = normalizeWaId(phone);
    if (!normalizedWaId) return null;

    const contact = await ensureContact({ waId: normalizedWaId, profileName: profileName || null });

    const isTemplate = mode === 'template';
    const preview = isTemplate
      ? `[template: ${templateName || process.env.META_WHATSAPP_TEMPLATE_NAME || 'saudacao_oficial'}]`
      : (sanitizeText(textBody) || '[mensagem]');

    const stored = await storeMessage({
      contactId: contact.id,
      waMessageId: messageId || null,
      direction: 'outbound',
      messageType: isTemplate ? 'template' : 'text',
      textBody: preview,
      status: 'accepted',
      rawPayload: rawPayload || null,
    });

    await updateConversationSnapshot({
      contactId: contact.id,
      previewText: preview,
      unreadDelta: 0,
    });

    return stored;
  } catch (err) {
    console.error('[saveOutboundToInbox] erro ao salvar mensagem no inbox:', err.message);
    return null;
  }
}

async function startNewConversation({ phone, name, message }) {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');

  if (!digits || digits.length < 10) {
    throw buildHttpError('Telefone inválido. Informe um número com DDD (ex: 11987654321).', 400);
  }

  // Normaliza: adiciona código do Brasil se necessário
  const waId = digits.length <= 11 ? `55${digits}` : digits;

  const normalizedName = sanitizeText(name);
  const normalizedMessage = sanitizeText(message);

  if (!normalizedMessage) {
    throw buildHttpError('Mensagem vazia.', 400);
  }

  const contact = await ensureContact({ waId, profileName: normalizedName || null });

  const providerResult = await sendMetaWhatsAppMessage({
    toPhone: waId,
    message: normalizedMessage,
    mode: 'text',
  });

  const providerStatus = sanitizeText(providerResult?.providerResponse?.messages?.[0]?.message_status) || 'accepted';

  const stored = await storeMessage({
    contactId: contact.id,
    waMessageId: providerResult.messageId,
    direction: 'outbound',
    messageType: 'text',
    textBody: normalizedMessage,
    status: providerStatus,
    rawPayload: providerResult.providerResponse || providerResult,
  });

  await updateConversationSnapshot({
    contactId: contact.id,
    previewText: normalizedMessage,
    unreadDelta: 0,
  });

  const conversation = await fetchConversationByWaId(waId);

  return {
    wa_id: waId,
    conversation,
    message: stored.message,
    providerResult,
  };
}

module.exports = {
  listInboxConversations,
  getInboxConversationMessages,
  markConversationAsRead,
  updateConversationTag,
  sendConversationReply,
  startNewConversation,
  saveOutboundToInbox,
  processMetaWebhookPayload,
};
