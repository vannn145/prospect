import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchKanbanCards, updateKanbanCard } from '../api/client';
import { getCategoryLabel, getStatusSiteLabel } from '../utils/labels';

const KANBAN_COLUMNS = [
  { key: 'entrada', title: 'Entrada' },
  { key: 'contato', title: 'Contato' },
  { key: 'proposta', title: 'Proposta' },
  { key: 'negociacao', title: 'Negociação' },
  { key: 'fechado', title: 'Fechado' },
  { key: 'perdido', title: 'Perdido' },
];

function createDraft(card) {
  return {
    stage: card.stage || 'entrada',
    notes: card.notes || '',
    next_action: card.next_action || '',
    proposal_value: card.proposal_value ?? '',
    due_date: card.due_date ? String(card.due_date).slice(0, 10) : '',
  };
}

function normalizePayload(draft) {
  return {
    stage: draft.stage,
    notes: draft.notes.trim() || null,
    next_action: draft.next_action.trim() || null,
    proposal_value: draft.proposal_value === '' ? null : Number(draft.proposal_value),
    due_date: draft.due_date || null,
  };
}

function KanbanPage({ onOpenDashboard }) {
  const [cards, setCards] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingCardId, setSavingCardId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadCards = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetchKanbanCards();
      setCards(response);

      const nextDrafts = Object.fromEntries(
        response.map((card) => [card.id, createDraft(card)])
      );

      setDrafts(nextDrafts);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const cardsByColumn = useMemo(() => {
    const grouped = Object.fromEntries(KANBAN_COLUMNS.map((column) => [column.key, []]));

    for (const card of cards) {
      const stage = card.stage || 'entrada';
      if (!grouped[stage]) {
        grouped.entrada.push(card);
        continue;
      }

      grouped[stage].push(card);
    }

    return grouped;
  }, [cards]);

  function handleDraftChange(cardId, field, value) {
    setDrafts((prev) => ({
      ...prev,
      [cardId]: {
        ...(prev[cardId] || {}),
        [field]: value,
      },
    }));
  }

  async function handleSaveCard(cardId) {
    const draft = drafts[cardId];

    if (!draft) {
      return;
    }

    setSavingCardId(cardId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await updateKanbanCard(cardId, normalizePayload(draft));
      const updatedCard = response.card;

      setCards((prev) => prev.map((card) => (card.id === updatedCard.id ? updatedCard : card)));
      setDrafts((prev) => ({
        ...prev,
        [updatedCard.id]: createDraft(updatedCard),
      }));

      setSuccessMessage('Cartão salvo com sucesso.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSavingCardId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-900 pb-10">
      <div className="mx-auto max-w-[1700px] space-y-6 px-4 py-6 md:px-6">
        <header className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <img src="/logo-keula.svg" alt="Keula" className="h-14 w-auto" />
              <p className="mt-2 text-sm text-slate-400">
                Quadro estilo Trello para organizar etapas e anexar informações de cada contato.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadCards}
                className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-600"
              >
                Atualizar quadro
              </button>
              <button
                type="button"
                onClick={onOpenDashboard}
                className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400"
              >
                Voltar ao painel
              </button>
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

        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-600 bg-slate-800 p-10 text-center text-slate-400">
            Carregando Kanban...
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-600 bg-slate-800 p-10 text-center text-slate-400">
            Nenhum cartão no Kanban ainda. Use o botão "Incluir no Kanban" na lista de contatos.
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {KANBAN_COLUMNS.map((column) => {
              const columnCards = cardsByColumn[column.key] || [];

              return (
                <section
                  key={column.key}
                    className="min-h-[300px] min-w-[320px] flex-1 rounded-xl border border-slate-700 bg-slate-800/50 p-3"
                >
                    <header className="mb-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-teal-400 shadow-sm">
                    {column.title} ({columnCards.length})
                  </header>

                  <div className="space-y-3">
                    {columnCards.map((card) => {
                      const draft = drafts[card.id] || createDraft(card);
                      const company = card.company || {};

                      return (
                        <article key={card.id} className="space-y-3 rounded-lg border border-slate-600 bg-slate-800 p-3 shadow-sm">
                          <div>
                              <h3 className="text-sm font-bold text-slate-200">{company.name}</h3>
                              <p className="mt-1 text-xs text-slate-400">
                              {company.city} • {getCategoryLabel(company.category)}
                            </p>
                              <p className="mt-1 text-xs text-slate-400">
                              Status site: {getStatusSiteLabel(company.status_site)}
                            </p>
                            {company.website && (
                              <a
                                href={company.website}
                                target="_blank"
                                rel="noreferrer"
                                  className="mt-1 inline-block text-xs text-teal-400 underline hover:text-teal-300"
                              >
                                Abrir site
                              </a>
                            )}
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-400">Etapa</label>
                            <select
                              value={draft.stage}
                              onChange={(event) => handleDraftChange(card.id, 'stage', event.target.value)}
                              className="w-full rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-slate-200"
                            >
                              {KANBAN_COLUMNS.map((option) => (
                                <option key={option.key} value={option.key}>
                                  {option.title}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-400">Próxima ação</label>
                            <input
                              type="text"
                              value={draft.next_action}
                              onChange={(event) =>
                                handleDraftChange(card.id, 'next_action', event.target.value)
                              }
                              placeholder="Ex: enviar proposta no WhatsApp"
                              className="w-full rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400">Valor proposta</label>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={draft.proposal_value}
                                onChange={(event) =>
                                  handleDraftChange(card.id, 'proposal_value', event.target.value)
                                }
                                placeholder="0,00"
                                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
                              />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400">Data de retorno</label>
                              <input
                                type="date"
                                value={draft.due_date}
                                onChange={(event) =>
                                  handleDraftChange(card.id, 'due_date', event.target.value)
                                }
                                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-slate-200"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-400">Anotações</label>
                            <textarea
                              rows={4}
                              value={draft.notes}
                              onChange={(event) => handleDraftChange(card.id, 'notes', event.target.value)}
                              placeholder="Adicione informações importantes dessa prospecção"
                              className="w-full rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSaveCard(card.id)}
                            disabled={savingCardId === card.id}
                             className="w-full rounded-md bg-green-500 px-3 py-2 text-xs font-semibold text-white hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-slate-600"
                          >
                            {savingCardId === card.id ? 'Salvando cartão...' : 'Salvar cartão'}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

export default KanbanPage;
