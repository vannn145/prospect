import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  fetchEmailOverview,
  fetchEmailInboxMessage,
  fetchEmailInboxMessages,
  sendEmailFromPanel,
} from '../api/client';
import StatCard from '../components/StatCard';

function formatDateTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusTagClass(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'sent') {
    return 'bg-emerald-500/20 text-emerald-300';
  }

  if (normalized === 'error') {
    return 'bg-rose-500/20 text-rose-300';
  }

  if (normalized === 'dry_run') {
    return 'bg-amber-500/20 text-amber-300';
  }

  return 'bg-slate-500/20 text-slate-300';
}

function EmailPage() {
  const [overview, setOverview] = useState({
    config: null,
    inbox: null,
    report: null,
  });
  const [messages, setMessages] = useState([]);
  const [selectedUid, setSelectedUid] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [prospectionOnly, setProspectionOnly] = useState(true);

  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const reportSummary = useMemo(() => overview.report?.summary || {}, [overview.report]);
  const inboxSummary = useMemo(() => overview.inbox || {}, [overview.inbox]);

  const loadOverview = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadingOverview(true);
    }

    try {
      const response = await fetchEmailOverview();
      setOverview({
        config: response.config || null,
        inbox: response.inbox || null,
        report: response.report || null,
      });
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

  const loadMessages = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadingMessages(true);
    }

    try {
      const response = await fetchEmailInboxMessages(activeSearch, 35, { prospectionOnly });
      const nextMessages = Array.isArray(response?.messages) ? response.messages : [];

      setMessages(nextMessages);

      setOverview((current) => ({
        ...current,
        inbox: {
          mailbox: response?.mailbox || current.inbox?.mailbox || 'INBOX',
          totalMessages: Number(response?.totalMessages || 0),
          unreadCount: Number(response?.unreadCount || 0),
        },
      }));

      if (!selectedUid && nextMessages.length) {
        setSelectedUid(nextMessages[0].uid);
        return;
      }

      if (selectedUid && !nextMessages.some((item) => Number(item.uid) === Number(selectedUid))) {
        setSelectedUid(nextMessages[0]?.uid || null);
      }
    } catch (error) {
      if (!silent) {
        setErrorMessage(error.message);
      }
    } finally {
      if (!silent) {
        setLoadingMessages(false);
      }
    }
  }, [activeSearch, prospectionOnly, selectedUid]);

  const loadSelectedMessage = useCallback(async (uid, { silent = false } = {}) => {
    if (!uid) {
      setSelectedMessage(null);
      return;
    }

    if (!silent) {
      setLoadingMessage(true);
    }

    try {
      const response = await fetchEmailInboxMessage(uid);
      setSelectedMessage(response?.message || null);
    } catch (error) {
      if (!silent) {
        setErrorMessage(error.message);
      }
    } finally {
      if (!silent) {
        setLoadingMessage(false);
      }
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    loadSelectedMessage(selectedUid);
  }, [selectedUid, loadSelectedMessage]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadOverview({ silent: true });
      loadMessages({ silent: true });

      if (selectedUid) {
        loadSelectedMessage(selectedUid, { silent: true });
      }
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadMessages, loadOverview, loadSelectedMessage, selectedUid]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    setActiveSearch(searchInput.trim());
  }

  async function handleRefreshAll() {
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await Promise.all([
        loadOverview({ silent: true }),
        loadMessages({ silent: true }),
      ]);

      if (selectedUid) {
        await loadSelectedMessage(selectedUid, { silent: true });
      }

      setSuccessMessage('Caixa de entrada atualizada com sucesso.');
    } catch {
      // Erros já tratados nos loaders
    }
  }

  async function handleSendEmail(event) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setSendingEmail(true);

    try {
      await sendEmailFromPanel({
        to: composeTo,
        subject: composeSubject,
        text: composeBody,
      });

      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      setIsComposeOpen(false);
      setSuccessMessage('E-mail enviado com sucesso pelo painel.');
      await loadOverview({ silent: true });
    } catch (error) {
      setErrorMessage(error.message || 'Falha ao enviar e-mail.');
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-900 pb-10">
      <div className="mx-auto max-w-[1700px] space-y-6 px-4 py-6 md:px-6">
        <header className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <img src="/logo-keula.svg" alt="Keula" className="h-14 w-auto" />
              <p className="mt-2 text-sm text-slate-400">
                Status da campanha de e-mails e caixa de entrada da conta comercial.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                SMTP: {overview.config?.smtpConfigured ? 'configurado' : 'não configurado'} • IMAP:{' '}
                {overview.config?.imapConfigured ? 'configurado' : 'não configurado'}
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[420px]">
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <button
                  type="button"
                  onClick={handleRefreshAll}
                  className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-600"
                >
                  Atualizar inbox
                </button>
              </div>
            </div>
          </div>
        </header>

        {(errorMessage || successMessage) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              errorMessage
                ? 'border-rose-700 bg-rose-950 text-rose-300'
                : 'border-emerald-700 bg-emerald-950 text-emerald-300'
            }`}
          >
            {errorMessage || successMessage}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard title="Inbox total" value={loadingOverview ? '...' : Number(inboxSummary.totalMessages || 0)} />
          <StatCard title="Não lidos" value={loadingOverview ? '...' : Number(inboxSummary.unreadCount || 0)} />
          <StatCard title="E-mails enviados" value={loadingOverview ? '...' : Number(reportSummary.sent || 0)} />
          <StatCard title="Falhas no envio" value={loadingOverview ? '...' : Number(reportSummary.error || 0)} />
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-sm">
          <div className="grid min-h-[680px] grid-cols-1 lg:grid-cols-[330px_1fr]">
            <aside className="border-b border-slate-700 bg-slate-900/70 lg:border-b-0 lg:border-r">
              <div className="border-b border-slate-700 p-4">
                <button
                  type="button"
                  onClick={() => setIsComposeOpen(true)}
                  className="w-full rounded-xl bg-teal-500 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-400"
                >
                  + Nova mensagem
                </button>

                <h2 className="mt-4 text-base font-semibold text-slate-100">Caixa de entrada</h2>
                <p className="mt-1 text-xs text-slate-400">Conta: {overview.config?.fromEmail || 'contato@impulsestrategy.com.br'}</p>

                <form className="mt-3 flex gap-2" onSubmit={handleSearchSubmit}>
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Buscar por assunto ou remetente"
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-400"
                  >
                    Buscar
                  </button>
                </form>

                <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={prospectionOnly}
                    onChange={(event) => setProspectionOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-400"
                  />
                  Mostrar apenas e-mails relacionados à prospecção
                </label>
              </div>

              <div className="max-h-[560px] overflow-y-auto">
                {loadingMessages ? (
                  <div className="p-4 text-sm text-slate-400">Carregando e-mails...</div>
                ) : messages.length === 0 ? (
                  <div className="p-4 text-sm text-slate-400">Nenhum e-mail encontrado.</div>
                ) : (
                  messages.map((message) => {
                    const isSelected = Number(message.uid) === Number(selectedUid);

                    return (
                      <button
                        type="button"
                        key={message.uid}
                        onClick={() => {
                          setIsComposeOpen(false);
                          setSelectedUid(message.uid);
                        }}
                        className={`w-full border-b border-slate-700 px-4 py-3 text-left transition ${
                          isSelected ? 'bg-slate-700/60 shadow-inner' : 'hover:bg-slate-800/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className={`truncate text-sm font-semibold ${message.seen ? 'text-slate-200' : 'text-teal-300'}`}>
                            {message.subject || '(sem assunto)'}
                          </span>
                          <span className="flex-shrink-0 text-[11px] text-slate-400">{formatDateTime(message.date)}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-400">
                          {!message.seen && <span className="mr-1 inline-flex h-2 w-2 rounded-full bg-teal-400" />}
                          {message.from || '(sem remetente)'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{message.preview || 'Sem prévia.'}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <section className="flex min-h-[620px] flex-col bg-slate-800">
              <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900/70 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{isComposeOpen ? 'Nova mensagem' : 'Leitura'}</p>
                  <p className="text-xs text-slate-400">
                    {isComposeOpen ? 'Envio manual estilo caixa de saída.' : 'Visualização da conversa selecionada.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {isComposeOpen ? (
                    <button
                      type="button"
                      onClick={() => setIsComposeOpen(false)}
                      className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                    >
                      Voltar para inbox
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsComposeOpen(true)}
                      className="rounded-lg bg-teal-500 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-400"
                    >
                      Redigir
                    </button>
                  )}
                </div>
              </div>

              {isComposeOpen ? (
                <form onSubmit={handleSendEmail} className="flex flex-1 flex-col gap-3 p-4">
                  <input
                    type="email"
                    value={composeTo}
                    onChange={(event) => setComposeTo(event.target.value)}
                    placeholder="Para"
                    className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                    required
                  />

                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(event) => setComposeSubject(event.target.value)}
                    placeholder="Assunto"
                    className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                    required
                  />

                  <textarea
                    value={composeBody}
                    onChange={(event) => setComposeBody(event.target.value)}
                    rows={14}
                    placeholder="Escreva sua mensagem"
                    className="min-h-[340px] flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                    required
                  />

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={sendingEmail}
                      className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-600"
                    >
                      {sendingEmail ? 'Enviando...' : 'Enviar e-mail'}
                    </button>
                  </div>
                </form>
              ) : selectedUid ? (
                loadingMessage ? (
                  <div className="p-6 text-sm text-slate-400">Carregando mensagem...</div>
                ) : selectedMessage ? (
                  <>
                    <div className="border-b border-slate-700 px-4 py-4">
                      <p className="text-lg font-semibold text-slate-100">{selectedMessage.subject || '(sem assunto)'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span><strong className="text-slate-300">De:</strong> {selectedMessage.from || '-'}</span>
                        <span><strong className="text-slate-300">Para:</strong> {selectedMessage.to || '-'}</span>
                        <span>{formatDateTime(selectedMessage.date)}</span>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5">
                      <pre className="whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm leading-relaxed text-slate-200">
                        {selectedMessage.text || 'Mensagem sem conteúdo de texto.'}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="p-6 text-sm text-slate-400">Não foi possível carregar essa mensagem.</div>
                )
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-sm text-slate-400">
                  Selecione um e-mail para visualizar o conteúdo.
                </div>
              )}
            </section>
          </div>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-1">
            <h2 className="text-base font-semibold text-slate-100">Status da campanha de envio</h2>
            {overview.report ? (
              <p className="text-xs text-slate-500">
                Relatório: {overview.report.fileName} • atualizado em {formatDateTime(overview.report.createdAt)}
              </p>
            ) : (
              <p className="text-xs text-slate-500">Nenhum relatório de envio encontrado.</p>
            )}
          </div>

          {!overview.report?.items?.length ? (
            <div className="rounded-lg border border-dashed border-slate-600 bg-slate-900 p-4 text-sm text-slate-400">
              Sem dados de envio para exibir.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="min-w-full divide-y divide-slate-700 text-sm">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-300">Empresa</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-300">E-mail</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-300">Status</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-300">Enviado em</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-300">Código WA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700 bg-slate-800">
                  {overview.report.items.map((item) => (
                    <tr key={`${item.company_id}-${item.to_email}-${item.message_id || item.sent_at || 'x'}`}>
                      <td className="px-3 py-2 text-slate-200">{item.company_name || '-'}</td>
                      <td className="px-3 py-2 text-slate-300">{item.to_email || '-'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusTagClass(item.status)}`}>
                          {item.status || 'unknown'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400">{formatDateTime(item.sent_at)}</td>
                      <td className="px-3 py-2 text-slate-400">{item.last_failed_code || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default EmailPage;
