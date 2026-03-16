const AUTH_TOKEN_KEY = 'prospect_auth_token';
const AUTH_USER_KEY = 'prospect_auth_user';

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function getAuthToken() {
  const storage = getStorage();
  return storage?.getItem(AUTH_TOKEN_KEY) || '';
}

export function getAuthUser() {
  const storage = getStorage();
  const raw = storage?.getItem(AUTH_USER_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(AUTH_TOKEN_KEY, token);
  storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(AUTH_TOKEN_KEY);
  storage.removeItem(AUTH_USER_KEY);
}