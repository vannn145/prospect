import { useEffect, useState } from 'react';
import { fetchCrmCompanyTimeline } from '../api/client';

function getChannelLabel(channel) {
  const normalized = String(channel || '').toLowerCase();

  if (normalized === 'email') {
    return '📧 Email';
  }

  if (normalized === 'whatsapp') {
    return '💬 WhatsApp';
  }

  if (normalized === 'site') {
    return '🌐 Site';
  }

  if (normalized === 'call') {
    return '☎️ Ligação';
  }

  if (normalized === 'meeting') {
    return '👥 Reunião';
  }

  if (normalized === 'proposal') {
    return '📄 Proposta';
  }

  if (normalized === 'note') {
    return '📝 Nota';
  }

  return 'Sistema';
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TimelinePage({ companyId, companyName, onBack }) {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!companyId) {
        setError('ID da empresa não fornecido');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const response = await fetchCrmCompanyTimeline(companyId, 500);
        setTimeline(Array.isArray(response?.timeline) ? response.timeline : []);
      } catch (err) {
        setError(err?.message || 'Erro ao carregar timeline');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [companyId]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-600"
            >
              ← Voltar
            </button>
            <h1 className="text-xl font-bold text-slate-100">
              Timeline · {companyName || 'Empresa'}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Histórico completo de eventos e interações
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-8">
        {error ? (
          <div className="rounded-lg border border-red-700 bg-red-900/30 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : loading ? (
          <div className="rounded-lg border border-dashed border-slate-600 bg-slate-900 p-12 text-center text-slate-400">
            <div className="inline-block animate-spin">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  opacity="0.25"
                />
                <path
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <p className="mt-4">Carregando timeline...</p>
          </div>
        ) : timeline.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-600 bg-slate-900 p-8 text-center text-slate-400">
            <p>Nenhum evento nesta timeline.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {timeline.map((item) => (
              <article
                key={item.id}
                className="rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm transition hover:border-slate-600 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-100">{item.title}</p>
                    {item.description && (
                      <p className="mt-2 text-sm text-slate-300">{item.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="inline-flex rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200">
                      {getChannelLabel(item.channel)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  {formatDateTime(item.created_at)}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
