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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            ← Voltar
          </button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Timeline
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {companyName || 'Empresa'} • Histórico completo
          </p>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      ) : loading ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400">
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
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400">
          <p>Nenhum evento nesta timeline.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {timeline.map((item) => (
            <article
              key={item.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
                  {item.description && (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{item.description}</p>
                    )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {getChannelLabel(item.channel)}
                  </span>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 dark:text-slate-500">
                {formatDateTime(item.created_at)}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
