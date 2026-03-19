const axios = require('axios');

/**
 * Valida e normaliza número de telefone para envio via WhatsApp.
 * Aceita números brasileiros com 10-13 dígitos (fixos ou celulares).
 * Números estrangeiros são repassados como-está.
 */
function normalizePhoneNumber(phone) {
  if (!phone) {
    return null;
  }

  const digits = String(phone).replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) {
    return null;
  }

  const defaultCountryCode = String(process.env.META_WHATSAPP_DEFAULT_COUNTRY_CODE || '55').replace(/\D/g, '') || '55';

  // Se o número tem até 11 dígitos e começa com default (BR), adiciona código país
  if (digits.length <= 11) {
    const withCountry = `${defaultCountryCode}${digits}`;
    // Valida: mínimo 10 dígitos (fixo BR) + 2 dígitos DDD, máximo 13 dígitos (celular BR)
    const totalDigits = withCountry.length;
    return totalDigits >= 12 && totalDigits <= 13 ? withCountry : null;
  }

  // Número já vem com código país
  return digits;
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
  const normalizedToPhone = normalizePhoneNumber(toPhone);

  if (!normalizedToPhone) {
    const error = new Error('Telefone da empresa inválido para envio via WhatsApp.');
    error.statusCode = 400;
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