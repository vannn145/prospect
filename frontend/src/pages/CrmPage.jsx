import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createCrmTask,
  fetchCrmCompanyTimeline,
  fetchCrmNextActions,
  fetchCrmOverview,
  fetchCrmPipeline,
  fetchCrmTasks,
  recalculateCrmScores,
  updateCrmTask,
} from '../api/client';
import StatCard from '../components/StatCard';

const STAGE_OPTIONS = [
  { value: '', label: 'Todas etapas' },
  { value: 'entrada', label: 'Entrada' },
  { value: 'contato', label: 'Contato' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'negociacao', label: 'Negociação' },
  { value: 'fechado', label: 'Fechado' },
  { value: 'perdido', label: 'Perdido' },
];

const TASK_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendente' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluída' },
  { value: 'canceled', label: 'Cancelada' },
];

const TASK_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
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
    return '-';
  }

  return parsed.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function getTaskStatusTagClass(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'done') {
    return 'bg-emerald-500/20 text-emerald-300';
  }

  if (normalized === 'in_progress') {
    return 'bg-sky-500/20 text-sky-300';
  }

  if (normalized === 'canceled') {
    return 'bg-slate-500/20 text-slate-300';
  }

  return 'bg-amber-500/20 text-amber-300';
}

function getTaskStatusLabel(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'in_progress') {
    return 'Em andamento';
  }

  if (normalized === 'done') {
    return 'Concluída';
  }

  if (normalized === 'canceled') {
    return 'Cancelada';
  }

  return 'Pendente';
}

function getChannelLabel(channel) {
  const normalized = String(channel || '').toLowerCase();

  if (normalized === 'whatsapp') {
    return 'WhatsApp';
  }

  if (normalized === 'email') {
    return 'E-mail';
  }

  if (normalized === 'task') {
    return 'Tarefa';
  }

  if (normalized === 'kanban') {
    return 'Kanban';
  }

  return 'Sistema';
}

function CrmPage() {
  const [overview, setOverview] = useState(null);
  const [pipelineItems, setPipelineItems] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [aiNotifications, setAiNotifications] = useState([]);

  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState('');

  const [stageFilter, setStageFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchValue, setSearchValue] = useState('');

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingPipeline, setLoadingPipeline] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [loadingAiNotifications, setLoadingAiNotifications] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState(null);
  const [creatingTask, setCreatingTask] = useState(false);

  const timelineRef = useRef(null);
  const [recalculatingScores, setRecalculatingScores] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [newTask, setNewTask] = useState({
    companyId: '',
    title: '',
    description: '',
    priority: 'medium',
    dueDate: '',
  });

  const loadOverview = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadingOverview(true);
    }

    try {
      const response = await fetchCrmOverview();
      setOverview(response || null);
    } catch (error) {
      if (!silent) {
        setErrorMessage(error.message);
      }
    } finally {
      if (!silent) {
        setLoadingOverview(false);
      }
    }
  }, []);

  const loadPipeline = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadingPipeline(true);
    }

    try {
      const response = await fetchCrmPipeline({
        stage: stageFilter,
        search: searchValue,
        limit: 300,
      });

      const nextItems = Array.isArray(response?.items) ? response.items : [];
      setPipelineItems(nextItems);

      if (!selectedCompanyId && nextItems.length) {
        setSelectedCompanyId(nextItems[0].company.id);
        setSelectedCompanyName(nextItems[0].company.name);
      }
    } catch (error) {
      if (!silent) {
        setErrorMessage(error.message);
      }
    } finally {
      if (!silent) {
        setLoadingPipeline(false);
      }
    }
  }, [searchValue, selectedCompanyId, stageFilter]);

  const loadTasks = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadingTasks(true);
    }

    try {
      const response = await fetchCrmTasks({
        status: '',
        stage: stageFilter,
        search: searchValue,
        limit: 200,
      });

      setTasks(Array.isArray(response?.tasks) ? response.tasks : []);
    } catch (error) {
      if (!silent) {
        setErrorMessage(error.message);
      }
    } finally {
      if (!silent) {
        setLoadingTasks(false);
      }
    }
  }, [searchValue, stageFilter]);

  const loadTimeline = useCallback(async (companyId) => {
    if (!companyId) {
      setTimeline([]);
      return;
    }

    setLoadingTimeline(true);

    try {
      const response = await fetchCrmCompanyTimeline(companyId, 120);
      setTimeline(Array.isArray(response?.timeline) ? response.timeline : []);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoadingTimeline(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadPipeline();
    loadTasks();
  }, [loadPipeline, loadTasks]);

  useEffect(() => {
    if (!selectedCompanyId) {
      return;
    }

    loadTimeline(selectedCompanyId);
  }, [loadTimeline, selectedCompanyId]);

  const tasksSummary = useMemo(() => overview?.tasks || {}, [overview]);
  const totals = useMemo(() => overview?.totals || {}, [overview]);

  async function handleRefreshAll() {
    setErrorMessage('');
    setSuccessMessage('');

    await Promise.all([
      loadOverview({ silent: true }),
      loadPipeline({ silent: true }),
      loadTasks({ silent: true }),
    ]);

    if (selectedCompanyId) {
      await loadTimeline(selectedCompanyId);
    }

    setSuccessMessage('CRM atualizado com sucesso.');
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    setSearchValue(searchInput.trim());
  }

  async function handleRecalculateScores() {
    setRecalculatingScores(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await recalculateCrmScores();
      await Promise.all([
        loadOverview({ silent: true }),
        loadPipeline({ silent: true }),
      ]);

      setSuccessMessage(`Score CRM recalculado para ${response.total || 0} empresa(s).`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setRecalculatingScores(false);
    }
  }

  async function handleCreateTask(event) {
    event.preventDefault();
    setCreatingTask(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        companyId: Number(newTask.companyId),
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        due_date: newTask.dueDate || null,
      };

      await createCrmTask(payload);

      setNewTask({
        companyId: '',
        title: '',
        description: '',
        priority: 'medium',
        dueDate: '',
      });

      await Promise.all([
        loadTasks({ silent: true }),
        loadOverview({ silent: true }),
        loadPipeline({ silent: true }),
      ]);

      setSuccessMessage('Tarefa CRM criada com sucesso.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setCreatingTask(false);
    }
  }

  async function handleUpdateTaskStatus(task, status) {
    setSavingTaskId(task.id);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await updateCrmTask(task.id, { status });

      await Promise.all([
        loadTasks({ silent: true }),
        loadOverview({ silent: true }),
        loadPipeline({ silent: true }),
      ]);

      setSuccessMessage('Status da tarefa atualizado.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSavingTaskId(null);
    }
  }

  const handleGenerateNextActions = useCallback(async () => {
    if (!selectedCompanyId) {
      return;
    }

    setLoadingAiNotifications(true);
    setErrorMessage('');

    try {
      const response = await fetchCrmNextActions(selectedCompanyId, 5);
      const suggestions = Array.isArray(response?.suggestions) ? response.suggestions : [];
      const engine = String(response?.engine || 'crm-engine');

      if (suggestions.length === 0) {
        setSuccessMessage('IA sem novas notificações para esta empresa agora.');
        return;
      }

      const companyName = selectedCompanyName || `Empresa #${selectedCompanyId}`;
      const createdAt = new Date().toISOString();
      const notification = {
        id: `${selectedCompanyId}-${Date.now()}`,
        companyId: selectedCompanyId,
        companyName,
        createdAt,
        engine,
        suggestions,
      };

      setAiNotifications((current) => [notification, ...current].slice(0, 15));
      setSuccessMessage(`🔔 IA gerou ${suggestions.length} notificação(ões) para ${companyName}.`);

      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (window.Notification.permission === 'granted') {
          new window.Notification(`CRM IA • ${companyName}`, {
            body: suggestions[0]?.title || 'Nova recomendação de próxima ação.',
          });
        } else if (window.Notification.permission === 'default') {
          window.Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
              new window.Notification(`CRM IA • ${companyName}`, {
                body: suggestions[0]?.title || 'Nova recomendação de próxima ação.',
              });
            }
          }).catch(() => null);
        }
      }
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoadingAiNotifications(false);
    }
  }, [selectedCompanyId, selectedCompanyName]);

  useEffect(() => {
    if (!selectedCompanyId) {
      return;
    }

    handleGenerateNextActions();
  }, [selectedCompanyId, handleGenerateNextActions]);

  return (
    <main className="min-h-screen bg-slate-900 pb-10">
      <div className="mx-auto max-w-[1800px] space-y-6 px-4 py-6 md:px-6">
        <header className="rounded-xl border border-slate-700 bg-slate-800 px-6 py-4 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <img src="/logo-keula-clean.svg" alt="Keula" className="h-10 w-auto" />
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[520px]">
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <button
                  type="button"
                  onClick={handleRefreshAll}
                  className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-600"
                >
                  Atualizar CRM
                </button>
                <button
                  type="button"
                  onClick={handleRecalculateScores}
                  disabled={recalculatingScores}
                  className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-600"
                >
                  {recalculatingScores ? 'Recalculando...' : 'Recalcular score'}
                </button>
              </div>
            </div>
          </div>
        </header>

        {(errorMessage || successMessage) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              errorMessage
                ? 'border-rose-700 bg-rose-950 text-rose-400'
                : 'border-green-700 bg-green-950 text-green-400'
            }`}
          >
            {errorMessage || successMessage}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-6">
          <StatCard title="Empresas" value={loadingOverview ? '...' : Number(totals.total_companies || 0)} />
          <StatCard title="Em pipeline" value={loadingOverview ? '...' : Number(totals.in_pipeline || 0)} />
          <StatCard title="Ganhos" value={loadingOverview ? '...' : Number(totals.won || 0)} />
          <StatCard title="Perdidos" value={loadingOverview ? '...' : Number(totals.lost || 0)} />
          <StatCard title="Win rate" value={loadingOverview ? '...' : `${Number(totals.win_rate || 0)}%`} />
          <StatCard title="Score médio" value={loadingOverview ? '...' : Number(totals.avg_crm_score || 0)} />
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <form className="flex flex-1 flex-wrap items-end gap-3" onSubmit={handleSearchSubmit}>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="crm-stage-filter">
                  Etapa
                </label>
                <select
                  id="crm-stage-filter"
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value)}
                  className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100"
                >
                  {STAGE_OPTIONS.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-[240px] flex-1">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="crm-search">
                  Busca
                </label>
                <input
                  id="crm-search"
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Nome, telefone, cidade ou categoria"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <button
                type="submit"
                className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400"
              >
                Aplicar filtros
              </button>
            </form>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[2fr,1fr]">
          <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-200">Pipeline CRM</h2>

            {loadingPipeline ? (
              <div className="rounded-lg border border-dashed border-slate-600 bg-slate-900 p-8 text-center text-sm text-slate-400">
                Carregando pipeline...
              </div>
            ) : pipelineItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-600 bg-slate-900 p-8 text-center text-sm text-slate-400">
                Nenhum item no pipeline para os filtros atuais.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="min-w-full divide-y divide-slate-700 text-sm">
                  <thead className="bg-slate-900 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Empresa</th>
                      <th className="px-3 py-2 text-left">Etapa</th>
                      <th className="px-3 py-2 text-left">Score</th>
                      <th className="px-3 py-2 text-left">Tarefas</th>
                      <th className="px-3 py-2 text-left">Próx. ação</th>
                      <th className="px-3 py-2 text-left">Proposta</th>
                      <th className="px-3 py-2 text-left">Última atividade</th>
                      <th className="px-3 py-2 text-left">Timeline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700 text-slate-200">
                    {pipelineItems.map((item) => (
                      <tr key={item.card_id}>
                        <td className="px-3 py-2">
                          <div className="font-semibold">{item.company.name}</div>
                          <div className="text-xs text-slate-400">{item.company.city} • {item.company.category}</div>
                        </td>
                        <td className="px-3 py-2">{item.stage_label}</td>
                        <td className="px-3 py-2">{Number(item.company.crm_score || 0)}</td>
                        <td className="px-3 py-2">{Number(item.open_tasks || 0)}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate" title={item.next_action || '-'}>
                          {item.next_action || '-'}
                        </td>
                        <td className="px-3 py-2">{formatCurrency(item.proposal_value)}</td>
                        <td className="px-3 py-2">{formatDateTime(item.last_activity_at)}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCompanyId(item.company.id);
                              setSelectedCompanyName(item.company.name || 'Empresa');
                              setNewTask((current) => ({
                                ...current,
                                companyId: String(item.company.id),
                              }));
                              // Scroll to timeline section after a short delay
                              setTimeout(() => {
                                timelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }, 100);
                            }}
                            className="rounded-md bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-600"
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-200">Tarefas CRM</h2>

            <form className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/50 p-3" onSubmit={handleCreateTask}>
              <div>
                <label className="mb-1 block text-xs text-slate-400" htmlFor="crm-task-company-id">ID empresa</label>
                <input
                  id="crm-task-company-id"
                  type="number"
                  min={1}
                  value={newTask.companyId}
                  onChange={(event) => setNewTask((current) => ({ ...current, companyId: event.target.value }))}
                  placeholder="Ex.: 1297"
                  required
                  className="w-full rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400" htmlFor="crm-task-title">Título</label>
                <input
                  id="crm-task-title"
                  type="text"
                  value={newTask.title}
                  onChange={(event) => setNewTask((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Ex.: Ligar para apresentar proposta"
                  required
                  className="w-full rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400" htmlFor="crm-task-desc">Descrição</label>
                <textarea
                  id="crm-task-desc"
                  rows={2}
                  value={newTask.description}
                  onChange={(event) => setNewTask((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Detalhes da tarefa"
                  className="w-full rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-sm text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400" htmlFor="crm-task-priority">Prioridade</label>
                  <select
                    id="crm-task-priority"
                    value={newTask.priority}
                    onChange={(event) => setNewTask((current) => ({ ...current, priority: event.target.value }))}
                    className="w-full rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-sm text-slate-100"
                  >
                    {TASK_PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400" htmlFor="crm-task-due">Vencimento</label>
                  <input
                    id="crm-task-due"
                    type="datetime-local"
                    value={newTask.dueDate}
                    onChange={(event) => setNewTask((current) => ({ ...current, dueDate: event.target.value }))}
                    className="w-full rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-sm text-slate-100"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={creatingTask}
                className="w-full rounded-md bg-teal-500 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-600"
              >
                {creatingTask ? 'Criando tarefa...' : 'Criar tarefa'}
              </button>
            </form>

            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-2">
              <p className="mb-2 text-xs text-slate-400">
                Abertas: {Number(tasksSummary.open || 0)} • Vencidas: {Number(tasksSummary.overdue || 0)} • Hoje: {Number(tasksSummary.due_today || 0)}
              </p>

              {loadingTasks ? (
                <div className="py-6 text-center text-sm text-slate-400">Carregando tarefas...</div>
              ) : tasks.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">Nenhuma tarefa encontrada.</div>
              ) : (
                <div className="max-h-[420px] space-y-2 overflow-y-auto">
                  {tasks.map((task) => (
                    <article key={task.id} className="rounded-md border border-slate-700 bg-slate-900 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{task.title}</p>
                          <p className="text-xs text-slate-400">
                            {task.company?.name || `Empresa #${task.company_id}`}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getTaskStatusTagClass(task.status)}`}>
                          {getTaskStatusLabel(task.status)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-500">Vence: {formatDateTime(task.due_date)}</p>
                        <select
                          value={task.status}
                          onChange={(event) => handleUpdateTaskStatus(task, event.target.value)}
                          disabled={savingTaskId === task.id}
                          className="rounded-md border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-slate-100 disabled:cursor-not-allowed disabled:bg-slate-600"
                        >
                          {TASK_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-sm" ref={timelineRef}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-200">
              Timeline {selectedCompanyName ? `• ${selectedCompanyName}` : ''}
            </h2>

            <button
              type="button"
              onClick={handleGenerateNextActions}
              disabled={!selectedCompanyId || loadingAiNotifications}
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              {loadingAiNotifications ? 'Gerando notificação IA...' : 'Gerar notificação IA'}
            </button>
          </div>

          {!selectedCompanyId ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-600 bg-slate-900 p-6 text-center text-sm text-slate-400">
              Selecione uma empresa no pipeline para ver o histórico completo.
            </div>
          ) : loadingTimeline ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-600 bg-slate-900 p-6 text-center text-sm text-slate-400">
              Carregando timeline...
            </div>
          ) : timeline.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-600 bg-slate-900 p-6 text-center text-sm text-slate-400">
              Sem eventos nesta timeline.
            </div>
          ) : (
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
              {timeline.map((item) => (
                <article key={item.id} className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                    <span className="text-[11px] text-slate-500">
                      {getChannelLabel(item.channel)} • {formatDateTime(item.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{item.details || '-'}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-200">Notificações IA</h2>
            <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200">
              {aiNotifications.length}
            </span>
          </div>

          {aiNotifications.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-600 bg-slate-900 p-5 text-sm text-slate-400">
              Sem notificações IA ainda.
            </div>
          ) : (
            <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto">
              {aiNotifications.map((notification) => (
                <article key={notification.id} className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">🔔 {notification.companyName}</p>
                    <span className="text-[11px] text-slate-500">
                      {formatDateTime(notification.createdAt)} • {notification.engine}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {notification.suggestions[0]?.title || 'Nova recomendação de ação.'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default CrmPage;
