const express = require('express');

const { getLatestEmailSendReport } = require('../services/emailCampaignService');
const {
  getEmailConfig,
  getInboxSummary,
  listInboxMessages,
  getInboxMessage,
  sendEmailFromPanel,
} = require('../services/emailInboxService');

const router = express.Router();

router.get('/overview', async (req, res, next) => {
  try {
    const [inbox, report] = await Promise.all([
      getInboxSummary(),
      Promise.resolve(getLatestEmailSendReport(200)),
    ]);

    return res.json({
      config: getEmailConfig(),
      inbox,
      report,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/inbox/messages', async (req, res, next) => {
  try {
    const { search = '', limit = 25, prospectionOnly = 'true' } = req.query;
    const normalizedProspectionOnly = ['1', 'true', 'yes', 'on'].includes(String(prospectionOnly).toLowerCase());
    const response = await listInboxMessages({
      search,
      limit: Number(limit || 25),
      prospectionOnly: normalizedProspectionOnly,
    });
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

router.post('/send', async (req, res, next) => {
  try {
    const response = await sendEmailFromPanel(req.body || {});
    return res.status(201).json({
      success: true,
      ...response,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/inbox/messages/:uid', async (req, res, next) => {
  try {
    const message = await getInboxMessage(req.params.uid);
    return res.json({ message });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;