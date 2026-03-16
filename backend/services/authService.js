const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function getAuthUsername() {
  return process.env.AUTH_USERNAME || 'admin';
}

function getAuthPassword() {
  return process.env.AUTH_PASSWORD || 'admin123';
}

function getJwtSecret() {
  return process.env.AUTH_JWT_SECRET || 'prospect_dev_secret_change_me';
}

function getTokenExpiresIn() {
  return process.env.AUTH_TOKEN_EXPIRES_IN || '7d';
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function buildAuthError(message, statusCode = 401) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function authenticateUser({ username, password }) {
  if (!username || !password) {
    throw buildAuthError('Informe usuário e senha.', 400);
  }

  const expectedUsername = getAuthUsername();
  const expectedPassword = getAuthPassword();

  const usernameMatches = timingSafeStringEqual(username, expectedUsername);
  const passwordMatches = timingSafeStringEqual(password, expectedPassword);

  if (!usernameMatches || !passwordMatches) {
    throw buildAuthError('Usuário ou senha inválidos.', 401);
  }

  return {
    username: expectedUsername,
  };
}

function issueAuthToken(user) {
  return jwt.sign(
    {
      sub: user.username,
      username: user.username,
    },
    getJwtSecret(),
    {
      expiresIn: getTokenExpiresIn(),
    }
  );
}

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token.trim();
}

function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret());
}

function requireAuth(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return next(buildAuthError('Token de acesso obrigatório.', 401));
  }

  try {
    const payload = verifyAuthToken(token);

    req.user = {
      username: payload.username || payload.sub,
    };

    return next();
  } catch {
    return next(buildAuthError('Token inválido ou expirado.', 401));
  }
}

module.exports = {
  authenticateUser,
  issueAuthToken,
  requireAuth,
};