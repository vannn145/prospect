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
} = require('../services/metaWhatsAppService');
const { saveOutboundToInbox } = require('../services/whatsappInboxService');

const router = express.Router();

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
      templateName: templateName || process.env.META_WHATSAPP_TEMPLATE_NAME || null,
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
