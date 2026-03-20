import { getAuthToken } from '../auth/session';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const token = getAuthToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.error || 'Falha ao processar requisição.');
    error.statusCode = response.status;
    error.responseData = data;
    throw error;
  }

  return data;
}

export async function login(payload) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchCurrentUser() {
  return request('/auth/me');
}

export async function changePassword(payload) {
  return request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchStats() {
  return request('/stats');
}

export async function fetchCompanies({
  status = 'todos',
  city = '',
  category = '',
  page = 1,
  perPage = 25,
  includeContacted = false,
} = {}) {
  const query = new URLSearchParams();

  if (status && status !== 'todos') {
    query.set('status', String(status));
  }

  if (String(city || '').trim()) {
    query.set('city', String(city).trim());
  }

  if (String(category || '').trim()) {
    query.set('category', String(category).trim());
  }

  query.set('page', String(Number(page) || 1));
  query.set('perPage', String(Number(perPage) || 25));
  query.set('includeContacted', String(Boolean(includeContacted)));

  return request(`/companies?${query.toString()}`);
}

export async function searchCompanies(payload) {
  return request('/search', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function markCompanyContacted(id) {
  return request(`/contacted/${id}`, {
    method: 'POST',
  });
}

export async function fetchKanbanCards() {
  return request('/kanban/cards');
}

export async function fetchKanbanColumns() {
  return request('/kanban/columns');
}

export async function createKanbanColumn(payload) {
  return request('/kanban/columns', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export async function deleteKanbanColumn(columnKey) {
  const normalizedKey = encodeURIComponent(String(columnKey || '').trim());
  return request(`/kanban/columns/${normalizedKey}`, {
    method: 'DELETE',
  });
}

export async function addCompanyToKanban(companyId, stage) {
  return request('/kanban/cards', {
    method: 'POST',
    body: JSON.stringify({ companyId, stage }),
  });
}

export async function updateKanbanCard(cardId, payload) {
  return request(`/kanban/cards/${cardId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function enrichCompanyInstagram(companyId) {
  return request(`/companies/${companyId}/instagram/enrich`, {
    method: 'POST',
  });
}

export async function enrichMissingInstagrams(limit = 30) {
  return request('/instagram/enrich', {
    method: 'POST',
    body: JSON.stringify({ limit }),
  });
}

export async function fetchMetaWhatsAppConfig() {
  return request('/whatsapp/meta/config');
}

export async function sendMetaWhatsAppToCompany(companyId, payload = {}) {
  return request(`/companies/${companyId}/whatsapp/send`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchInboxConversations(search = '') {
  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
  return request(`/whatsapp/inbox/conversations${query}`);
}

export async function fetchInboxMessages(waId, limit = 120) {
  const normalizedWaId = encodeURIComponent(String(waId || '').trim());
  return request(`/whatsapp/inbox/conversations/${normalizedWaId}/messages?limit=${Number(limit || 120)}`);
}

export async function markInboxConversationRead(waId) {
  const normalizedWaId = encodeURIComponent(String(waId || '').trim());
  return request(`/whatsapp/inbox/conversations/${normalizedWaId}/read`, {
    method: 'PATCH',
  });
}

export async function sendInboxReply(waId, payload = {}) {
  const normalizedWaId = encodeURIComponent(String(waId || '').trim());
  return request(`/whatsapp/inbox/conversations/${normalizedWaId}/reply`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchEmailOverview() {
  return request('/email/overview');
}

export async function fetchEmailInboxMessages(search = '', limit = 25, options = {}) {
  const { prospectionOnly = true } = options || {};
  const query = new URLSearchParams();

  if (search?.trim()) {
    query.set('search', search.trim());
  }

  query.set('limit', String(Number(limit || 25)));
  query.set('prospectionOnly', String(Boolean(prospectionOnly)));

  return request(`/email/inbox/messages?${query.toString()}`);
}

export async function sendEmailFromPanel(payload) {
  return request('/email/send', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export async function fetchEmailInboxMessage(uid) {
  const normalizedUid = encodeURIComponent(String(uid || '').trim());
  return request(`/email/inbox/messages/${normalizedUid}`);
}

export async function fetchCrmOverview() {
  return request('/crm/overview');
}

export async function fetchCrmPipeline({ stage = '', search = '', limit = 300 } = {}) {
  const query = new URLSearchParams();

  if (String(stage || '').trim()) {
    query.set('stage', String(stage).trim());
  }

  if (String(search || '').trim()) {
    query.set('search', String(search).trim());
  }

  query.set('limit', String(Number(limit || 300)));

  return request(`/crm/pipeline?${query.toString()}`);
}

export async function fetchCrmTasks({ status = '', stage = '', search = '', limit = 200 } = {}) {
  const query = new URLSearchParams();

  if (String(status || '').trim()) {
    query.set('status', String(status).trim());
  }

  if (String(stage || '').trim()) {
    query.set('stage', String(stage).trim());
  }

  if (String(search || '').trim()) {
    query.set('search', String(search).trim());
  }

  query.set('limit', String(Number(limit || 200)));

  return request(`/crm/tasks?${query.toString()}`);
}

export async function createCrmTask(payload) {
  return request('/crm/tasks', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export async function updateCrmTask(taskId, payload) {
  return request(`/crm/tasks/${Number(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload || {}),
  });
}

export async function fetchCrmCompanyTimeline(companyId, limit = 120) {
  return request(`/crm/companies/${Number(companyId)}/timeline?limit=${Number(limit || 120)}`);
}

export async function recalculateCrmScores(payload = {}) {
  return request('/crm/scores/recalculate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export { API_BASE_URL };
