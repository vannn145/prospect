const express = require('express');

const {
  listInboxConversations,
  getInboxConversationMessages,
  markConversationAsRead,
  updateConversationTag,
  sendConversationReply,
  startNewConversation,
} = require('../services/whatsappInboxService');

const router = express.Router();

router.get('/conversations', async (req, res, next) => {
  try {
    const conversations = await listInboxConversations({
      search: req.query.search,
    });

    return res.json(conversations);
  } catch (error) {
    return next(error);
  }
});

router.get('/conversations/:waId/messages', async (req, res, next) => {
  try {
    const { waId } = req.params;
    const result = await getInboxConversationMessages({
      waId,
      limit: req.query.limit,
    });

    if (!result) {
      return res.status(404).json({
        error: 'Conversa não encontrada.',
      });
    }

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.patch('/conversations/:waId/read', async (req, res, next) => {
  try {
    const updated = await markConversationAsRead({
      waId: req.params.waId,
    });

    if (!updated) {
      return res.status(404).json({
        error: 'Conversa não encontrada.',
      });
    }

    return res.json({
      message: 'Conversa marcada como lida.',
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/conversations/:waId/tag', async (req, res, next) => {
  try {
    const updatedConversation = await updateConversationTag({
      waId: req.params.waId,
      tag: req.body?.tag,
    });

    if (!updatedConversation) {
      return res.status(404).json({
        error: 'Conversa não encontrada.',
      });
    }

    return res.json({
      message: 'Tag da conversa atualizada com sucesso.',
      conversation: updatedConversation,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/conversations/new', async (req, res, next) => {
  try {
    const { phone, name, message } = req.body || {};

    const result = await startNewConversation({ phone, name, message });

    return res.json({
      message: 'Mensagem enviada com sucesso.',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/conversations/:waId/reply', async (req, res, next) => {
  try {
    const { message } = req.body || {};

    const result = await sendConversationReply({
      waId: req.params.waId,
      message,
    });

    return res.json({
      message: 'Resposta enviada com sucesso.',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
