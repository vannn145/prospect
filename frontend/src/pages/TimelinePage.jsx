import { useEffect, useMemo, useState } from 'react';
import { createCrmCompanyActivity, fetchCrmCompanyTimeline, updateKanbanCard } from '../api/client';

const STAGE_FLOW = [
  { key: 'entrada', label: 'Prospecção' },
  { key: 'contato', label: 'Investigação' },
  { key: 'proposta', label: 'Qualificação' },
  { key: 'negociacao', label: 'Solução / Demo' },
  { key: 'fechado', label: 'Ganho' },
];

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

function formatCurrency(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 'R$ 0,00';
  }

  return parsed.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function normalizeStage(stage, stageLabel) {
  const normalized = String(stage || '').toLowerCase();
  if (normalized) {
    return normalized;
  }

  const normalizedLabel = String(stageLabel || '').toLowerCase();
  if (normalizedLabel.includes('contato')) {
    return 'contato';
  }
  if (normalizedLabel.includes('proposta')) {
    return 'proposta';
  }
  if (normalizedLabel.includes('negocia')) {
    return 'negociacao';
  }
  if (normalizedLabel.includes('fechado')) {
    return 'fechado';
  }
  return 'entrada';
}

function ActionIcon({ type }) {
  if (type === 'note') {
    return <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 11h6M7 3h10a2 2 0 0 1 2 2v10l-3 3H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />;
  }
  if (type === 'email') {
    return <><rect x="3" y="5" width="18" height="14" rx="2" strokeWidth="1.8" /><path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="m4 7 8 6 8-6" /></>;
  }
  if (type === 'call') {
    return <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M6.5 4h2l1.2 3.5-1.6 1.6a13 13 0 0 0 6.8 6.8l1.6-1.6L20 15.5v2a1.5 1.5 0 0 1-1.5 1.5c-7.2-.4-13.1-6.3-13.5-13.5A1.5 1.5 0 0 1 6.5 4Z" />;
  }
  if (type === 'proposal') {
    return <><rect x="5" y="3" width="14" height="18" rx="2" strokeWidth="1.8" /><path strokeWidth="1.8" strokeLinecap="round" d="M8 8h8M8 12h8M8 16h5" /></>;
  }
  if (type === 'meeting') {
    return <><circle cx="9" cy="9" r="2" strokeWidth="1.8" /><circle cx="15" cy="9" r="2" strokeWidth="1.8" /><path strokeWidth="1.8" strokeLinecap="round" d="M5.5 17a3.5 3.5 0 0 1 7 0M11.5 17a3.5 3.5 0 0 1 7 0" /></>;
  }
  return <><path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-4.7 7-11a7 7 0 1 0-14 0c0 6.3 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" strokeWidth="1.8" /></>;
}

export default function TimelinePage({ companyId, companyName, companyData, onBack }) {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [activeActionTab, setActiveActionTab] = useState('note');
  const [selectedStage, setSelectedStage] = useState('entrada');
  const [actionFeedback, setActionFeedback] = useState('');
  const [savingAction, setSavingAction] = useState(false);
  const [updatingStage, setUpdatingStage] = useState(false);

  const currentStage = useMemo(
    () => normalizeStage(companyData?.stage, companyData?.stage_label),
    [companyData?.stage, companyData?.stage_label],
  );

  useEffect(() => {
    setSelectedStage(currentStage);
  }, [currentStage]);

  async function handleSaveAction() {
    const trimmed = noteDraft.trim();

    if (!trimmed) {
      setActionFeedback('Escreva uma observação antes de salvar.');
      return;
    }

    const actionLabels = {
      note: 'Nota registrada',
      email: 'E-mail registrado',
      call: 'Ligação registrada',
      proposal: 'Proposta registrada',
      meeting: 'Reunião registrada',
      visit: 'Visita registrada',
    };

    const actionChannels = {
      note: 'system',
      email: 'email',
      call: 'task',
      proposal: 'task',
      meeting: 'task',
      visit: 'task',
    };

    try {
      setSavingAction(true);

      const response = await createCrmCompanyActivity(companyId, {
        cardId: companyData?.card_id || null,
        title: actionLabels[activeActionTab] || 'Ação registrada',
        details: trimmed,
        activityType: `manual_${activeActionTab}`,
        channel: actionChannels[activeActionTab] || 'system',
        metadata: {
          action_tab: activeActionTab,
          source: 'crm_detail',
        },
      });

      const savedActivity = response?.activity;

      if (savedActivity) {
        setTimeline((current) => [
          {
            id: `activity-${savedActivity.id}`,
            created_at: savedActivity.created_at,
            channel: savedActivity.channel,
            activity_type: savedActivity.activity_type,
            title: savedActivity.title,
            details: savedActivity.details,
            metadata: savedActivity.metadata || {},
          },
          ...current,
        ]);
      }

      setNoteDraft('');
      setActionFeedback('Ação registrada no histórico.');
    } catch (saveError) {
      setActionFeedback(saveError?.message || 'Erro ao salvar ação.');
    } finally {
      setSavingAction(false);
    }
  }

  async function handleStageChange(stageKey) {
    setSelectedStage(stageKey);

    if (!companyData?.card_id) {
      setActionFeedback('Não foi possível atualizar fase: card CRM não encontrado.');
      return;
    }

    try {
      setUpdatingStage(true);
      await updateKanbanCard(companyData.card_id, { stage: stageKey });
      setActionFeedback('Fase atualizada com sucesso.');
    } catch (stageError) {
      setActionFeedback(stageError?.message || 'Erro ao atualizar fase.');
      setSelectedStage(currentStage);
    } finally {
      setUpdatingStage(false);
    }
  }

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
        setError(err?.message || 'Erro ao carregar histórico da empresa');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [companyId]);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{companyName || 'Empresa'}</h1>
            <p className="mt-1 text-sm text-slate-600">Ficha CRM da oportunidade</p>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
              <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
            </svg>
            Voltar
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 xl:grid-cols-5">
          {STAGE_FLOW.map((stage, index) => {
            const isActive = stage.key === selectedStage;
            const isFirst = index === 0;
            const isLast = index === STAGE_FLOW.length - 1;

            let clipPath = 'polygon(12px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0 50%)';
            if (isFirst) {
              clipPath = 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)';
            }
            if (isLast) {
              clipPath = 'polygon(12px 0, 100% 0, 100% 100%, 12px 100%, 0 50%)';
            }

            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => handleStageChange(stage.key)}
                disabled={updatingStage}
                style={{ clipPath }}
                className={`rounded-lg border px-3 py-2 text-center text-sm font-semibold ${
                  isActive
                    ? 'border-teal-500 bg-teal-500/10 text-teal-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {stage.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: 'note', label: 'Nota' },
                { key: 'email', label: 'E-mail' },
                { key: 'call', label: 'Ligação' },
                { key: 'proposal', label: 'Proposta' },
                { key: 'meeting', label: 'Reunião' },
                { key: 'visit', label: 'Visita' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveActionTab(item.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    activeActionTab === item.key
                      ? 'border-teal-500 bg-teal-500/10 text-teal-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-3.5 w-3.5">
                    <ActionIcon type={item.key} />
                  </svg>
                  {item.label}
                </button>
              ))}
            </div>

            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              rows={3}
              placeholder="O que foi feito e qual o próximo passo?"
              className="mt-3 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
            />

            {actionFeedback && (
              <p className="mt-2 text-xs font-semibold text-teal-700">{actionFeedback}</p>
            )}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleSaveAction}
                disabled={savingAction}
                className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400"
              >
                {savingAction ? 'Salvando...' : 'Salvar e marcar como finalizada'}
              </button>
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-900">Histórico de atividades</h2>

            {error ? (
              <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
            ) : loading ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">Carregando histórico...</div>
            ) : timeline.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">Ainda não há eventos para esta empresa.</div>
            ) : (
              <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto">
                {timeline.map((item) => (
                  <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base font-semibold text-slate-900">{item.title}</p>
                      <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {String(item.channel || 'sistema').toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
                    {item.description && <p className="mt-2 text-sm text-slate-700">{item.description}</p>}
                    {item.details && <p className="mt-2 text-sm text-slate-700">{item.details}</p>}
                  </article>
                ))}
              </div>
            )}
          </article>
        </div>

        <aside className="space-y-4">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Valor do negócio</h3>
            <p className="mt-2 text-4xl font-bold text-slate-900">{formatCurrency(companyData?.proposal_value)}</p>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p><span className="font-semibold">Próxima ação:</span> {companyData?.next_action || '-'}</p>
              <p><span className="font-semibold">Tarefas abertas:</span> {Number(companyData?.open_tasks || 0)}</p>
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Dados do negócio</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p><span className="font-semibold">Etapa:</span> {companyData?.stage_label || '-'}</p>
              <p><span className="font-semibold">Score CRM:</span> {Number(companyData?.company?.crm_score || 0)}</p>
              <p><span className="font-semibold">Última atividade:</span> {formatDateTime(companyData?.last_activity_at)}</p>
              <p><span className="font-semibold">Categoria:</span> {companyData?.company?.category || '-'}</p>
              <p><span className="font-semibold">Cidade:</span> {companyData?.company?.city || '-'}</p>
              <p><span className="font-semibold">Telefone:</span> {companyData?.company?.phone || '-'}</p>
              <p><span className="font-semibold">Site:</span> {companyData?.company?.site || '-'}</p>
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
