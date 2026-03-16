const express = require('express');

const {
  authenticateUser,
  issueAuthToken,
  requireAuth,
} = require('../services/authService');

const router = express.Router();

router.post('/login', (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const user = authenticateUser({ username, password });
    const token = issueAuthToken(user);

    return res.json({
      token,
      user,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({
    user: req.user,
  });
});

module.exports = router;