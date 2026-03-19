const axios = require('axios');

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

/**
 * Valida e normaliza número de telefone para envio via WhatsApp.
 * Por padrão, aceita somente celular BR (55 + DDD + 9 + 8 dígitos).
 * Número fixo BR pode ser permitido via META_WHATSAPP_ALLOW_BR_LANDLINE=true.
 * Números estrangeiros são repassados como-está.
 */
function resolveNormalizedPhone(phone) {
  if (!phone) {
    return {
      normalized: null,
      reason: 'empty',
    };
  }

  const digits = String(phone).replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) {
    return {
      normalized: null,
      reason: 'no_digits',
    };
  }

  const defaultCountryCode = String(process.env.META_WHATSAPP_DEFAULT_COUNTRY_CODE || '55').replace(/\D/g, '') || '55';
  const allowBrLandline = parseBoolean(process.env.META_WHATSAPP_ALLOW_BR_LANDLINE, false);

  const normalized = digits.length <= 11
    ? `${defaultCountryCode}${digits}`
    : digits;

  if (normalized.length < 10 || normalized.length > 15) {
    return {
      normalized: null,
      reason: 'invalid_length',
      digits: normalized,
    };
  }

  if (!normalized.startsWith('55')) {
    return {
      normalized,
      reason: 'ok_foreign',
    };
  }

  const brSubscriberFirstDigit = normalized[4];

  if (normalized.length === 13 && brSubscriberFirstDigit === '9') {
    return {
      normalized,
      reason: 'ok_br_mobile',
    };
  }

  if (normalized.length === 12 && allowBrLandline) {
    return {
      normalized,
      reason: 'ok_br_landline_allowed',
    };
  }

  if (normalized.length === 12 && !allowBrLandline) {
    return {
      normalized: null,
      reason: 'br_landline_blocked',
      digits: normalized,
    };
  }

  return {
    normalized: null,
    reason: 'br_invalid_mobile',
    digits: normalized,
  };
}

function normalizePhoneNumber(phone) {
  return resolveNormalizedPhone(phone).normalized;
}

function getDefaultMode() {
  const mode = String(process.env.META_WHATSAPP_DEFAULT_MODE || 'text').toLowerCase();
  return mode === 'template' ? 'template' : 'text';
}

function getMetaWhatsAppConfig() {
  const apiVersion = process.env.META_WHATSAPP_API_VERSION || 'v22.0';
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const defaultTemplateName = process.env.META_WHATSAPP_TEMPLATE_NAME;

  return {
    configured: Boolean(phoneNumberId && accessToken),
    apiVersion,
    defaultMode: getDefaultMode(),
    phoneNumberIdConfigured: Boolean(phoneNumberId),
    accessTokenConfigured: Boolean(accessToken),
    defaultTemplateConfigured: Boolean(defaultTemplateName),
    defaultTemplateName: defaultTemplateName || null,
    defaultTemplateLanguageCode: process.env.META_WHATSAPP_TEMPLATE_LANGUAGE_CODE || 'pt_BR',
  };
}

function ensureConfigured() {
  const config = getMetaWhatsAppConfig();
  if (config.configured) {
    return config;
  }

  const missing = [];

  if (!config.phoneNumberIdConfigured) {
    missing.push('META_WHATSAPP_PHONE_NUMBER_ID');
  }

  if (!config.accessTokenConfigured) {
    missing.push('META_WHATSAPP_ACCESS_TOKEN');
  }

  const error = new Error(`Integração Meta WhatsApp não configurada. Preencha: ${missing.join(', ')}`);
  error.statusCode = 400;
  throw error;
}

function buildTemplateComponents(templateParameters) {
  if (!Array.isArray(templateParameters) || templateParameters.length === 0) {
    return undefined;
  }

  const parameters = templateParameters
    .filter((value) => value !== undefined && value !== null)
    .map((value) => ({
      type: 'text',
      text: String(value),
    }));

  if (!parameters.length) {
    return undefined;
  }

  return [
    {
      type: 'body',
      parameters,
    },
  ];
}

async function sendMetaWhatsAppMessage({
  toPhone,
  message,
  mode,
  templateName,
  templateLanguageCode,
  templateParameters,
} = {}) {
  const config = ensureConfigured();
  const normalization = resolveNormalizedPhone(toPhone);
  const normalizedToPhone = normalization.normalized;

  if (!normalizedToPhone) {
    const detailedMessageByReason = {
      br_landline_blocked: 'Telefone fixo BR bloqueado para evitar falha de entrega no WhatsApp. Se quiser permitir tentativa, configure META_WHATSAPP_ALLOW_BR_LANDLINE=true.',
      br_invalid_mobile: 'Telefone BR inválido para WhatsApp (esperado celular com 9 dígitos).',
      invalid_length: 'Telefone com tamanho inválido para WhatsApp.',
      no_digits: 'Telefone sem dígitos válidos.',
      empty: 'Telefone vazio.',
    };

    const reasonMessage = detailedMessageByReason[normalization.reason] || 'Telefone da empresa inválido para envio via WhatsApp.';

    const error = new Error(reasonMessage);
    error.statusCode = 400;
    error.validationReason = normalization.reason;
    throw error;
  }

  const resolvedMode = mode === 'template' || mode === 'text' ? mode : config.defaultMode;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedToPhone,
    type: resolvedMode,
  };

  if (resolvedMode === 'template') {
    const resolvedTemplateName = templateName || process.env.META_WHATSAPP_TEMPLATE_NAME;
    const resolvedLanguageCode = templateLanguageCode || process.env.META_WHATSAPP_TEMPLATE_LANGUAGE_CODE || 'pt_BR';

    if (!resolvedTemplateName) {
      const error = new Error('Template não configurado. Defina META_WHATSAPP_TEMPLATE_NAME ou envie templateName na requisição.');
      error.statusCode = 400;
      throw error;
    }

    const components = buildTemplateComponents(templateParameters);

    payload.template = {
      name: resolvedTemplateName,
      language: {
        code: resolvedLanguageCode,
      },
      ...(components ? { components } : {}),
    };
  } else {
    const resolvedMessage = typeof message === 'string' ? message.trim() : '';

    if (!resolvedMessage) {
      const error = new Error('Mensagem vazia. Envie o campo message para disparo em modo text.');
      error.statusCode = 400;
      throw error;
    }

    payload.text = {
      body: resolvedMessage,
      preview_url: false,
    };
  }

  const url = `https://graph.facebook.com/${config.apiVersion}/${process.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: Number(process.env.META_WHATSAPP_TIMEOUT_MS || 15000),
    });

    const providerMessage = response.data?.messages?.[0] || null;

    return {
      provider: 'meta_whatsapp_cloud',
      mode: resolvedMode,
      to: normalizedToPhone,
      messageId: providerMessage?.id || null,
      providerResponse: response.data,
    };
  } catch (error) {
    const providerError = error.response?.data?.error;
    const providerMessage = providerError?.message || error.message;
    const providerDetails = providerError?.error_data?.details;
    const fullProviderMessage = providerDetails
      ? `${providerMessage} (${providerDetails})`
      : providerMessage;

    const mappedError = new Error(`Meta WhatsApp: ${fullProviderMessage}`);
    mappedError.statusCode = error.response?.status || 502;
    mappedError.providerError = providerError || null;
    throw mappedError;
  }
}

module.exports = {
  getMetaWhatsAppConfig,
  sendMetaWhatsAppMessage,
  normalizePhoneNumber,
};