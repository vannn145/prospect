const express = require('express');

const { processMetaWebhookPayload } = require('../services/whatsappInboxService');

const router = express.Router();

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const verifyToken = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.META_WHATSAPP_VERIFY_TOKEN;

  if (mode !== 'subscribe' || !challenge || !expectedToken) {
    return res.sendStatus(403);
  }

  if (verifyToken !== expectedToken) {
    return res.sendStatus(403);
  }

  return res.status(200).send(challenge);
});

router.post('/', async (req, res, next) => {
  try {
    await processMetaWebhookPayload(req.body || {});
    return res.sendStatus(200);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
