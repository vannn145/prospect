const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || 'Falha ao processar requisição.');
  }

  return data;
}

export async function fetchStats() {
  return request('/stats');
}

export async function fetchCompanies(status) {
  const query = status && status !== 'todos' ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/companies${query}`);
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

export { API_BASE_URL };
