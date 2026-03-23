import { useCallback, useEffect, useState } from 'react';

import {
  fetchCompanies,
  fetchStats,
  markCompanyContacted,
  searchCompanies,
  addCompanyToKanban,
  enrichCompanyInstagram,
  enrichMissingInstagrams,
  fetchMetaWhatsAppConfig,
  sendMetaWhatsAppToCompany,
  createCompanyManual,
} from '../api/client';
import { CATEGORY_OPTIONS } from '../utils/labels';
import LeadsTable from '../components/LeadsTable';
import SearchForm from '../components/SearchForm';
import StatCard from '../components/StatCard';
import { getCategoryLabel } from '../utils/labels';

const DEFAULT_WHATSAPP_MESSAGE = `Olá, tudo bem?

Encontrei sua empresa no Google e percebi que vocês ainda não possuem um site profissional ou presença digital forte.

Hoje muitas empresas estão recebendo novos clientes através do Google e do WhatsApp.

Trabalho com criação de sites rápidos e integrados ao WhatsApp que ajudam empresas a aparecer mais no Google e gerar mais clientes.

Se quiser posso te mostrar um exemplo de site para o seu segmento.`;

const STATUS_FILTERS = [
  { label: 'Todos', value: 'todos' },
  { label: 'Sem site', value: 'sem_site' },
  { label: 'Site fraco', value: 'site_fraco' },
  { label: 'Site ok', value: 'site_ok' },
];

const EMPTY_STATS = {
  total_empresas: 0,
  sem_site: 0,
  site_fraco: 0,
  contatadas: 0,
};

const DEFAULT_COMPANIES_PAGINATION = {
  page: 1,
  perPage: 25,
  total: 0,
  totalPages: 1,
};

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function DashboardPage() {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [companies, setCompanies] = useState([]);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [searchScope, setSearchScope] = useState({ city: '', category: '' });
  const [companiesPage, setCompaniesPage] = useState(1);
  const [companiesPerPage, setCompaniesPerPage] = useState(25);
  const [gotoPageInput, setGotoPageInput] = useState('1');
  const [companiesPagination, setCompaniesPagination] = useState(DEFAULT_COMPANIES_PAGINATION);

  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [searching, setSearching] = useState(false);
  const [contactingId, setContactingId] = useState(null);
  const [addingKanbanId, setAddingKanbanId] = useState(null);
  const [findingInstagramId, setFindingInstagramId] = useState(null);
  const [enrichingInstagrams, setEnrichingInstagrams] = useState(false);
  const [sendingMetaMessageId, setSendingMetaMessageId] = useState(null);

  const [metaWhatsAppConfig, setMetaWhatsAppConfig] = useState({
    loading: true,
    configured: false,
    defaultMode: 'text',
  });

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [showManualModal, setShowManualModal] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualForm, setManualForm] = useState({
    name: '', phone: '', city: '', category: 'dentist',
    address: '', website: '', status_site: 'sem_site',
  });

  const hasSearchScope = Boolean(String(searchScope.city || '').trim() || String(searchScope.category || '').trim());

  const loadStats = useCallback(async () => {
    setLoadingStats(true);

    try {
      const response = await fetchStats();
      setStats({
        ...EMPTY_STATS,
        ...response,
      });
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadCompanies = useCallback(async ({ status, page, perPage } = {}) => {
    setLoadingCompanies(true);

    try {
      const requestedStatus = status || statusFilter;
      const requestedPage = Number(page || companiesPage);
      const requestedPerPage = Number(perPage || companiesPerPage);
      const requestedCity = String(searchScope.city || '').trim();
      const requestedCategory = String(searchScope.category || '').trim();

      const response = await fetchCompanies({
        status: requestedStatus,
        city: requestedCity,
        category: requestedCategory,
        page: requestedPage,
        perPage: requestedPerPage,
        includeContacted: false,
      });

      const nextCompanies = Array.isArray(response?.items) ? response.items : [];
      const totalPages = Math.max(1, Number(response?.totalPages || 1));

      setCompanies(nextCompanies);
      setCompaniesPagination({
        page: Number(response?.page || requestedPage),
        perPage: Number(response?.perPage || requestedPerPage),
        total: Number(response?.total || 0),
        totalPages,
      });

      if (requestedPage > totalPages) {
        setCompaniesPage(totalPages);
      }
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoadingCompanies(false);
    }
  }, [statusFilter, companiesPage, companiesPerPage, searchScope.city, searchScope.category]);

  const loadMetaConfig = useCallback(async () => {
    try {
      const config = await fetchMetaWhatsAppConfig();
      setMetaWhatsAppConfig({
        loading: false,
        configured: Boolean(config.configured),
        defaultMode: config.defaultMode || 'text',
      });
    } catch {
      setMetaWhatsAppConfig({
        loading: false,
        configured: false,
        defaultMode: 'text',
      });
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    loadMetaConfig();
  }, [loadMetaConfig]);

  useEffect(() => {
    setGotoPageInput(String(companiesPage));
  }, [companiesPage]);

  async function handleSearch(payload) {
    setSearching(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await searchCompanies({
        ...payload,
        includeInstagram: false,
        maxPages: 2,
      });
      setSearchScope({
        city: payload.city || '',
        category: payload.category || '',
      });
      setSuccessMessage(`Busca concluída: ${result.saved} empresas salvas.`);
      setCompaniesPage(1);

      await Promise.all([loadStats(), loadCompanies({ status: statusFilter, page: 1 })]);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleFindInstagram(companyId) {
    setFindingInstagramId(companyId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await enrichCompanyInstagram(companyId);
      setSuccessMessage(result.message);
      await loadCompanies();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setFindingInstagramId(null);
    }
  }

  async function handleEnrichMissingInstagrams() {
    setEnrichingInstagrams(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await enrichMissingInstagrams(30);
      setSuccessMessage(`Busca de Instagram concluída: ${result.updated} perfil(is) encontrado(s).`);
      await loadCompanies();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setEnrichingInstagrams(false);
    }
  }

  async function handleMarkContacted(companyId) {
    setContactingId(companyId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await markCompanyContacted(companyId);
      setSuccessMessage('Empresa marcada como contatada.');

      await Promise.all([loadStats(), loadCompanies()]);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setContactingId(null);
    }
  }

  async function handleAddToKanban(companyId) {
    setAddingKanbanId(companyId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await addCompanyToKanban(companyId);
      setSuccessMessage('Contato incluído no Kanban com sucesso.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setAddingKanbanId(null);
    }
  }

  async function handleCopyMessage() {
    setErrorMessage('');

    try {
      await copyText(DEFAULT_WHATSAPP_MESSAGE);
      setSuccessMessage('Mensagem copiada com sucesso.');
    } catch {
      setErrorMessage('Não foi possível copiar a mensagem.');
    }
  }

  async function handleSendMetaMessage(lead) {
    if (!lead?.id) {
      return;
    }

    if (!lead.phone) {
      setErrorMessage('Empresa sem telefone para envio via WhatsApp.');
      return;
    }

    setSendingMetaMessageId(lead.id);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await sendMetaWhatsAppToCompany(lead.id, {
        mode: 'template',
      });

      await addCompanyToKanban(lead.id);
      await markCompanyContacted(lead.id);

      await Promise.all([loadStats(), loadCompanies()]);

      const providerIdMessage = result.messageId ? ` ID: ${result.messageId}` : '';
      setSuccessMessage(`Mensagem enviada via Meta para ${lead.name}.${providerIdMessage} Lead movida para o Kanban.`);
    } catch (error) {
      const metaErrorCode = String(
        error?.responseData?.deliveryStatus?.errorCode
        || error?.responseData?.blockedFailure?.errorCode
        || ''
      ).trim();

      if (metaErrorCode === '131049') {
        setErrorMessage('A Meta bloqueou este envio (131049) para este contato. Use o botão verde do WhatsApp (manual) para seguir com a prospecção.');
        return;
      }

      if (metaErrorCode === '131047') {
        setErrorMessage('A Meta bloqueou texto fora da janela de 24h (131047). Use o botão verde do WhatsApp (manual) para continuar o contato.');
        return;
      }

      setErrorMessage(error.message);
    } finally {
      setSendingMetaMessageId(null);
    }
  }

  function handleStatusFilterChange(nextStatus) {
    setStatusFilter(nextStatus);
    setCompaniesPage(1);
  }

  function handleChangePerPage(nextPerPage) {
    const normalizedPerPage = Number(nextPerPage) || 25;
    setCompaniesPerPage(normalizedPerPage);
    setCompaniesPage(1);
  }

  function handlePreviousPage() {
    setCompaniesPage((current) => Math.max(1, current - 1));
  }

  function handleNextPage() {
    setCompaniesPage((current) => Math.min(companiesPagination.totalPages, current + 1));
  }

  function handleGoToPage() {
    const parsed = Number(gotoPageInput);

    if (!Number.isFinite(parsed)) {
      setGotoPageInput(String(companiesPage));
      return;
    }

    const targetPage = Math.max(1, Math.min(companiesPagination.totalPages, Math.floor(parsed)));
    setCompaniesPage(targetPage);
  }

  function handleClearSearchScope() {
    setSearchScope({ city: '', category: '' });
    setCompaniesPage(1);
    setSuccessMessage('Filtro da busca limpo. Exibindo lista geral.');
    setErrorMessage('');
  }

  function handleClearCityScope() {
    setSearchScope((current) => ({
      ...current,
      city: '',
    }));
    setCompaniesPage(1);
    setSuccessMessage('Filtro de cidade removido.');
    setErrorMessage('');
  }

  function handleClearCategoryScope() {
    setSearchScope((current) => ({
      ...current,
      category: '',
    }));
    setCompaniesPage(1);
    setSuccessMessage('Filtro de categoria removido.');
    setErrorMessage('');
  }

  function handleManualFormChange(event) {
    const { name, value } = event.target;
    setManualForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleManualSubmit(event) {
    event.preventDefault();
    setManualLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await createCompanyManual(manualForm);
      setShowManualModal(false);
      setManualForm({ name: '', phone: '', city: '', category: 'dentist', address: '', website: '', status_site: 'sem_site' });
      setSuccessMessage('Cliente cadastrado com sucesso!');
      await Promise.all([loadStats(), loadCompanies()]);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setManualLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-900 pb-10">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
        <header className="rounded-xl border border-slate-700 bg-slate-800 px-6 py-4 shadow-sm">
          <div className="flex items-center justify-start">
            <img src="/logo-keula-clean.svg" alt="Keula" className="h-10 w-auto" />
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

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Total empresas"
            value={loadingStats ? '...' : stats.total_empresas}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M4 21V7l8-4 8 4v14M9 21V13h6v8" />
              </svg>
            }
          />
          <StatCard
            title="Sem site"
            value={loadingStats ? '...' : stats.sem_site}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <circle cx="12" cy="12" r="9" strokeLinecap="round" />
                <path strokeLinecap="round" d="M4.5 9h15M4.5 15h15" />
                <path strokeLinecap="round" d="M3 3l18 18" />
              </svg>
            }
          />
          <StatCard
            title="Site fraco"
            value={loadingStats ? '...' : stats.site_fraco}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 20h2v-4H2v4zm4 0h2v-7H6v7zm4 0h2v-10h-2v10zm4 0h2v-5h-2v5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 20h2v-2h-2v2z" />
              </svg>
            }
          />
          <StatCard
            title="Contatadas"
            value={loadingStats ? '...' : stats.contatadas}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                <circle cx="12" cy="12" r="9" strokeLinecap="round" />
              </svg>
            }
          />
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-200">Buscar empresas</h2>
          <p className="mb-4 mt-1 text-sm text-slate-400">
            Informe cidade, categoria e raio para coletar novos contatos.
          </p>
          <SearchForm onSubmit={handleSearch} loading={searching} />
        </section>

        <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-200">Lista de contatos</h2>
              <button
                type="button"
                onClick={() => setShowManualModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16" />
                </svg>
                Cadastrar cliente
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {hasSearchScope && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-teal-700/50 bg-teal-900/30 px-3 py-2 text-sm text-teal-200">
                  <span className="font-semibold text-teal-100">Filtro ativo:</span>

                  {searchScope.city && (
                    <button
                      type="button"
                      onClick={handleClearCityScope}
                      className="inline-flex items-center gap-1 rounded-full border border-teal-600 bg-teal-800/40 px-2 py-0.5 text-xs font-semibold text-teal-100 hover:bg-teal-700/50"
                      title="Remover filtro de cidade"
                    >
                      {searchScope.city}
                      <span aria-hidden="true">×</span>
                    </button>
                  )}

                  {searchScope.category && (
                    <button
                      type="button"
                      onClick={handleClearCategoryScope}
                      className="inline-flex items-center gap-1 rounded-full border border-teal-600 bg-teal-800/40 px-2 py-0.5 text-xs font-semibold text-teal-100 hover:bg-teal-700/50"
                      title="Remover filtro de categoria"
                    >
                      {getCategoryLabel(searchScope.category)}
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </div>
              )}

              {hasSearchScope && (
                <button
                  type="button"
                  onClick={handleClearSearchScope}
                  className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-600"
                >
                  Limpar filtro da busca
                </button>
              )}

              <button
                type="button"
                onClick={handleEnrichMissingInstagrams}
                disabled={enrichingInstagrams}
                  className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-600"
              >
                {enrichingInstagrams ? 'Buscando Instagrams...' : 'Buscar Instagrams'}
              </button>
                <label htmlFor="statusFilter" className="text-sm font-medium text-slate-300">
                Filtrar por status
              </label>
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={(event) => handleStatusFilterChange(event.target.value)}
                  className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-teal-500"
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadingCompanies ? (
            <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900 p-8 text-center text-slate-400">
              Carregando contatos...
            </div>
          ) : (
            <>
              <LeadsTable
                leads={companies}
                onMarkContacted={handleMarkContacted}
                onCopyMessage={handleCopyMessage}
                onSendMetaMessage={handleSendMetaMessage}
                onAddToKanban={handleAddToKanban}
                onFindInstagram={handleFindInstagram}
                contactingId={contactingId}
                addingKanbanId={addingKanbanId}
                findingInstagramId={findingInstagramId}
                sendingMetaMessageId={sendingMetaMessageId}
                metaMessagingEnabled={metaWhatsAppConfig.configured}
              />

              <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-slate-400">
                  {companiesPagination.total} contato(s) • Página {companiesPagination.page} de {companiesPagination.totalPages}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="companiesPerPage" className="text-sm font-medium text-slate-300">
                    Por página
                  </label>
                  <select
                    id="companiesPerPage"
                    value={companiesPerPage}
                    onChange={(event) => handleChangePerPage(event.target.value)}
                    className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-teal-500"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>

                  <button
                    type="button"
                    onClick={handlePreviousPage}
                    disabled={companiesPage <= 1}
                    className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>

                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={companiesPage >= companiesPagination.totalPages}
                    className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Próxima
                  </button>

                  <label htmlFor="goToPage" className="text-sm font-medium text-slate-300">
                    Ir para
                  </label>
                  <input
                    id="goToPage"
                    type="number"
                    min={1}
                    max={companiesPagination.totalPages}
                    value={gotoPageInput}
                    onChange={(event) => setGotoPageInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleGoToPage();
                      }
                    }}
                    className="w-20 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-teal-500"
                  />
                  <button
                    type="button"
                    onClick={handleGoToPage}
                    disabled={loadingCompanies}
                    className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Ir
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-100">Cadastrar cliente manualmente</h2>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-slate-200"
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2" onSubmit={handleManualSubmit}>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Nome <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text" name="name" required value={manualForm.name}
                  onChange={handleManualFormChange}
                  placeholder="Ex: Clínica Dr. João"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Cidade <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text" name="city" required value={manualForm.city}
                  onChange={handleManualFormChange}
                  placeholder="Ex: São Paulo"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Categoria <span className="text-rose-400">*</span>
                </label>
                <select
                  name="category" value={manualForm.category}
                  onChange={handleManualFormChange}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 focus:border-teal-400 focus:outline-none"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Telefone</label>
                <input
                  type="tel" name="phone" value={manualForm.phone}
                  onChange={handleManualFormChange}
                  placeholder="Ex: 11987654321"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Status do site</label>
                <select
                  name="status_site" value={manualForm.status_site}
                  onChange={handleManualFormChange}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 focus:border-teal-400 focus:outline-none"
                >
                  <option value="sem_site">Sem site</option>
                  <option value="site_fraco">Site fraco</option>
                  <option value="site_ok">Site ok</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Endereço</label>
                <input
                  type="text" name="address" value={manualForm.address}
                  onChange={handleManualFormChange}
                  placeholder="Endereço completo (opcional)"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Site</label>
                <input
                  type="url" name="website" value={manualForm.website}
                  onChange={handleManualFormChange}
                  placeholder="https://... (opcional)"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                />
              </div>

              {errorMessage && (
                <div className="sm:col-span-2">
                  <p className="rounded-lg border border-rose-700 bg-rose-950 px-3 py-2 text-xs text-rose-300">{errorMessage}</p>
                </div>
              )}

              <div className="flex justify-end gap-3 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={manualLoading}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-600"
                >
                  {manualLoading ? 'Salvando...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

export default DashboardPage;
