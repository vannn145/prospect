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
  API_BASE_URL,
} from '../api/client';
import LeadsTable from '../components/LeadsTable';
import SearchForm from '../components/SearchForm';
import StatCard from '../components/StatCard';

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

  const loadCompanies = useCallback(async (status) => {
    setLoadingCompanies(true);

    try {
      const response = await fetchCompanies(status);
      const nextCompanies = Array.isArray(response) ? response : [];
      setCompanies(nextCompanies.filter((company) => !company.contacted));
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

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
    loadCompanies(statusFilter);
  }, [loadCompanies, statusFilter]);

  useEffect(() => {
    loadMetaConfig();
  }, [loadMetaConfig]);

  async function handleSearch(payload) {
    setSearching(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await searchCompanies({
        ...payload,
        includeInstagram: true,
      });
      setSuccessMessage(`Busca concluída: ${result.saved} empresas salvas.`);

      await Promise.all([loadStats(), loadCompanies(statusFilter)]);
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
      await loadCompanies(statusFilter);
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
      await loadCompanies(statusFilter);
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

      await Promise.all([loadStats(), loadCompanies(statusFilter)]);
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

      setCompanies((current) => current.filter((company) => company.id !== lead.id));
      await loadStats();

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

  return (
    <main className="min-h-screen bg-slate-900 pb-10">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
        <header className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <img src="/logo-keula.svg" alt="Keula" className="h-14 w-auto" />
              <p className="mt-3 text-sm text-slate-400">
                Coleta via Google Places API, classificação de presença digital e prospecção manual via WhatsApp.
              </p>
              <p className="mt-1 text-xs text-slate-600">API: {API_BASE_URL}</p>
              <p className="mt-1 text-xs text-slate-500">
                Meta WhatsApp:{' '}
                {metaWhatsAppConfig.loading
                  ? 'verificando...'
                  : metaWhatsAppConfig.configured
                  ? `conectado (${metaWhatsAppConfig.defaultMode})`
                  : 'não configurado'}
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[340px]" />
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
          <StatCard title="Total empresas" value={loadingStats ? '...' : stats.total_empresas} />
          <StatCard title="Sem site" value={loadingStats ? '...' : stats.sem_site} />
          <StatCard title="Site fraco" value={loadingStats ? '...' : stats.site_fraco} />
          <StatCard title="Contatadas" value={loadingStats ? '...' : stats.contatadas} />
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
              <h2 className="text-lg font-semibold text-slate-200">Lista de contatos</h2>

            <div className="flex flex-wrap items-center gap-2">
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
                onChange={(event) => setStatusFilter(event.target.value)}
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
          )}
        </section>
      </div>
    </main>
  );
}

export default DashboardPage;
