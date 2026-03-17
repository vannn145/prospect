import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchInboxConversations,
  fetchInboxMessages,
  markInboxConversationRead,
  sendInboxReply,
} from '../api/client';
import UserAccountPanel from '../components/UserAccountPanel';

function formatConversationTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const isSameDay = date.toDateString() === now.toDateString();

  if (isSameDay) {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatMessageTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDisplayName(conversation) {
  return conversation?.display_name || conversation?.profile_name || conversation?.wa_id || 'Contato';
}

function getInitials(name) {
  const normalized = String(name || '').trim();

  if (!normalized) {
    return 'CT';
  }

  const parts = normalized.split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

function getLatestInboundMessage(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  for (let index = list.length - 1; index >= 0; index -= 1) {
    const message = list[index];

    if (message?.direction === 'inbound') {
      return message;
    }
  }

  return null;
}

function WhatsAppInboxPage({
  onOpenDashboard,
  onOpenKanban,
  onLogout,
  authUser,
}) {
  const [conversations, setConversations] = useState([]);
  const [selectedWaId, setSelectedWaId] = useState('');
  const [messages, setMessages] = useState([]);

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [replyText, setReplyText] = useState('');

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const messageEndRef = useRef(null);
  const unreadByWaIdRef = useRef(new Map());
  const lastInboundMessageIdByWaIdRef = useRef(new Map());
  const hasLoadedConversationsRef = useRef(false);
  const audioContextRef = useRef(null);

  const getAudioContext = useCallback(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextCtor) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }

    return audioContextRef.current;
  }, []);

  const unlockAudioContext = useCallback(() => {
    const context = getAudioContext();

    if (!context || context.state !== 'suspended') {
      return;
    }

    context.resume().catch(() => null);
  }, [getAudioContext]);

  const playNotificationSound = useCallback(() => {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    const playBeep = () => {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, now);

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.start(now);
      oscillator.stop(now + 0.22);
    };

    if (context.state === 'suspended') {
      context.resume().then(playBeep).catch(() => null);
      return;
    }

    playBeep();
  }, [getAudioContext]);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.wa_id === selectedWaId) || null,
    [conversations, selectedWaId]
  );

  const loadConversations = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoadingConversations(true);
      }

      try {
        const response = await fetchInboxConversations(activeSearch);
        const nextConversations = Array.isArray(response) ? response : [];
        let shouldNotify = false;

        if (hasLoadedConversationsRef.current) {
          for (const conversation of nextConversations) {
            const waId = conversation?.wa_id;

            if (!waId || waId === selectedWaId) {
              continue;
            }

            const previousUnread = Number(unreadByWaIdRef.current.get(waId) || 0);
            const currentUnread = Number(conversation?.unread_count || 0);

            if (currentUnread > previousUnread) {
              shouldNotify = true;
              break;
            }
          }
        }

        const nextUnreadMap = new Map();

        for (const conversation of nextConversations) {
          if (conversation?.wa_id) {
            nextUnreadMap.set(conversation.wa_id, Number(conversation?.unread_count || 0));
          }
        }

        unreadByWaIdRef.current = nextUnreadMap;
        hasLoadedConversationsRef.current = true;

        setConversations(nextConversations);

        if (shouldNotify) {
          playNotificationSound();
        }
      } catch (error) {
        if (!silent) {
          setErrorMessage(error.message);
        }
      } finally {
        if (!silent) {
          setLoadingConversations(false);
        }
      }
    },
    [activeSearch, playNotificationSound, selectedWaId]
  );

  const loadMessages = useCallback(async (waId, { silent = false } = {}) => {
    if (!waId) {
      setMessages([]);
      return;
    }

    if (!silent) {
      setLoadingMessages(true);
    }

    try {
      const response = await fetchInboxMessages(waId, 180);
      const nextMessages = Array.isArray(response?.messages) ? response.messages : [];
      const latestInboundMessage = getLatestInboundMessage(nextMessages);
      const latestInboundMessageId = latestInboundMessage?.id || null;
      const previousInboundMessageId = lastInboundMessageIdByWaIdRef.current.get(waId) || null;

      if (latestInboundMessageId) {
        if (previousInboundMessageId && latestInboundMessageId !== previousInboundMessageId) {
          playNotificationSound();
        }

        lastInboundMessageIdByWaIdRef.current.set(waId, latestInboundMessageId);
      }

      setMessages(nextMessages);
    } catch (error) {
      if (!silent) {
        setErrorMessage(error.message);
      }
    } finally {
      if (!silent) {
        setLoadingMessages(false);
      }
    }
  }, [playNotificationSound]);

  useEffect(() => {
    unreadByWaIdRef.current = new Map();
    hasLoadedConversationsRef.current = false;
  }, [activeSearch]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleUserInteraction = () => {
      unlockAudioContext();
    };

    window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
    window.addEventListener('keydown', handleUserInteraction);

    return () => {
      window.removeEventListener('pointerdown', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
    };
  }, [unlockAudioContext]);

  useEffect(() => () => {
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => null);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedWaId && conversations.length) {
      setSelectedWaId(conversations[0].wa_id);
      return;
    }

    if (selectedWaId && !conversations.some((conversation) => conversation.wa_id === selectedWaId)) {
      setSelectedWaId(conversations[0]?.wa_id || '');
    }
  }, [conversations, selectedWaId]);

  useEffect(() => {
    if (!selectedWaId) {
      setMessages([]);
      return;
    }

    loadMessages(selectedWaId);

    markInboxConversationRead(selectedWaId)
      .then(() => loadConversations({ silent: true }))
      .catch(() => null);
  }, [selectedWaId, loadMessages, loadConversations]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadConversations({ silent: true });

      if (selectedWaId) {
        loadMessages(selectedWaId, { silent: true });
      }
    }, 6000);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadConversations, loadMessages, selectedWaId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    setActiveSearch(searchInput.trim());
  }

  async function handleOpenConversation(waId) {
    setSelectedWaId(waId);
    setSuccessMessage('');

    try {
      await markInboxConversationRead(waId);
      await loadConversations({ silent: true });
    } catch {
      // Não bloqueia navegação por falha de leitura
    }
  }

  async function handleSendReply(event) {
    event.preventDefault();

    const normalizedMessage = replyText.trim();

    if (!selectedWaId || !normalizedMessage) {
      return;
    }

    setSendingReply(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await sendInboxReply(selectedWaId, {
        message: normalizedMessage,
      });

      setReplyText('');
      setSuccessMessage('Mensagem enviada com sucesso.');

      await Promise.all([
        loadConversations({ silent: true }),
        loadMessages(selectedWaId, { silent: true }),
      ]);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSendingReply(false);
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
                Conversas em estilo WhatsApp para receber mensagens e responder leads em tempo real.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[360px]">
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <button
                  type="button"
                  onClick={() => loadConversations()}
                  className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-600"
                >
                  Atualizar inbox
                </button>
                <button
                  type="button"
                  onClick={onOpenDashboard}
                  className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400"
                >
                  Painel
                </button>
                <button
                  type="button"
                  onClick={onOpenKanban}
                  className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400"
                >
                  Kanban
                </button>
              </div>
              <UserAccountPanel authUser={authUser} onLogout={onLogout} />
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

        <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-sm">
          <div className="grid min-h-[640px] grid-cols-1 lg:grid-cols-[360px_1fr]">
            <aside className="border-b border-slate-700 bg-slate-900/70 lg:border-b-0 lg:border-r">
              <div className="border-b border-slate-700 p-4">
                <h2 className="text-base font-semibold text-slate-100">Conversas</h2>
                <p className="mt-1 text-xs text-slate-400">Recebidas via Meta WhatsApp Cloud API</p>

                <form className="mt-3 flex gap-2" onSubmit={handleSearchSubmit}>
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Buscar por nome ou número"
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-400"
                  >
                    Buscar
                  </button>
                </form>
              </div>

              <div className="max-h-[560px] overflow-y-auto">
                {loadingConversations ? (
                  <div className="p-4 text-sm text-slate-400">Carregando conversas...</div>
                ) : conversations.length === 0 ? (
                  <div className="p-4 text-sm text-slate-400">Nenhuma conversa encontrada.</div>
                ) : (
                  conversations.map((conversation) => {
                    const isSelected = conversation.wa_id === selectedWaId;
                    const conversationName = getDisplayName(conversation);
                    const preview = conversation.last_message_preview || 'Sem mensagens ainda.';

                    return (
                      <button
                        type="button"
                        key={conversation.wa_id}
                        onClick={() => handleOpenConversation(conversation.wa_id)}
                        className={`flex w-full items-start gap-3 border-b border-slate-700 px-4 py-3 text-left transition ${
                          isSelected ? 'bg-slate-700/60' : 'hover:bg-slate-800/80'
                        }`}
                      >
                        <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-300">
                          {getInitials(conversationName)}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-slate-100">{conversationName}</span>
                            <span className="flex-shrink-0 text-[11px] text-slate-400">
                              {formatConversationTime(conversation.last_message_at)}
                            </span>
                          </span>

                          <span className="mt-1 block truncate text-xs text-slate-400">{preview}</span>

                          <span className="mt-1 flex items-center justify-between gap-2">
                            <span className="truncate text-[11px] text-slate-500">{conversation.phone_display}</span>
                            {conversation.unread_count > 0 && (
                              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-teal-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                {conversation.unread_count}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <section className="flex min-h-[640px] flex-col bg-slate-800">
              {selectedConversation ? (
                <>
                  <div className="border-b border-slate-700 bg-slate-900/70 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-100">{getDisplayName(selectedConversation)}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {selectedConversation.phone_display}
                      {selectedConversation.company?.name
                        ? ` • Empresa vinculada: ${selectedConversation.company.name}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex-1 overflow-y-auto bg-slate-800 px-4 py-4">
                    {loadingMessages ? (
                      <div className="text-sm text-slate-400">Carregando mensagens...</div>
                    ) : messages.length === 0 ? (
                      <div className="text-sm text-slate-400">Sem mensagens nessa conversa.</div>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((message) => {
                          const isOutbound = message.direction === 'outbound';

                          return (
                            <div key={message.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                              <article
                                className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                                  isOutbound
                                    ? 'bg-teal-500 text-white'
                                    : 'bg-slate-700 text-slate-100'
                                }`}
                              >
                                <p className="whitespace-pre-wrap break-words">{message.text_body || '[mensagem]'}</p>
                                <p
                                  className={`mt-1 text-[11px] ${
                                    isOutbound ? 'text-teal-100' : 'text-slate-300'
                                  }`}
                                >
                                  {formatMessageTime(message.created_at)}
                                  {isOutbound && message.status ? ` • ${message.status}` : ''}
                                </p>
                              </article>
                            </div>
                          );
                        })}
                        <div ref={messageEndRef} />
                      </div>
                    )}
                  </div>

                  <form className="border-t border-slate-700 bg-slate-900/60 p-4" onSubmit={handleSendReply}>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <textarea
                        rows={2}
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        placeholder="Digite sua resposta para o cliente..."
                        className="w-full resize-none rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={sendingReply || !replyText.trim()}
                        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-600"
                      >
                        {sendingReply ? 'Enviando...' : 'Enviar'}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-sm text-slate-400">
                  Selecione uma conversa para visualizar mensagens e responder.
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

export default WhatsAppInboxPage;
