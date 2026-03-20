import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createKanbanColumn,
  deleteKanbanColumn,
  fetchKanbanCards,
  fetchKanbanColumns,
  updateKanbanCard,
} from '../api/client';
import { getCategoryLabel, getStatusSiteLabel } from '../utils/labels';

function createDraft(card, fallbackStage = 'entrada') {
  return {
    stage: card.stage || fallbackStage,
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

function KanbanPage() {
  const [cards, setCards] = useState([]);
  const [columns, setColumns] = useState([]);
  const [drafts, setDrafts] = useState({});

  const [loading, setLoading] = useState(true);
  const [savingCardId, setSavingCardId] = useState(null);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [deletingColumnKey, setDeletingColumnKey] = useState('');

  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [draggingCardId, setDraggingCardId] = useState(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState('');

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const [cardsResponse, columnsResponse] = await Promise.all([
        fetchKanbanCards(),
        fetchKanbanColumns(),
      ]);

      const nextCards = Array.isArray(cardsResponse) ? cardsResponse : [];
      const nextColumns = Array.isArray(columnsResponse?.columns) ? columnsResponse.columns : [];
      const fallbackStage = nextColumns[0]?.key || 'entrada';

      setCards(nextCards);
      setColumns(nextColumns);

      const nextDrafts = Object.fromEntries(
        nextCards.map((card) => [card.id, createDraft(card, fallbackStage)])
      );

      setDrafts(nextDrafts);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const cardsByColumn = useMemo(() => {
    const grouped = Object.fromEntries(columns.map((column) => [column.key, []]));
    const fallbackKey = columns[0]?.key;

    for (const card of cards) {
      const stage = card.stage || fallbackKey;

      if (grouped[stage]) {
        grouped[stage].push(card);
      } else if (fallbackKey) {
        grouped[fallbackKey].push(card);
      }
    }

    return grouped;
  }, [cards, columns]);

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
        [updatedCard.id]: createDraft(updatedCard, columns[0]?.key || 'entrada'),
      }));

      setSuccessMessage('Cartão salvo com sucesso.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSavingCardId(null);
    }
  }

  async function handleDropCard(targetColumnKey) {
    const cardId = Number(draggingCardId);
    setDragOverColumnKey('');

    if (!cardId || !targetColumnKey) {
      setDraggingCardId(null);
      return;
    }

    const currentCard = cards.find((item) => Number(item.id) === cardId);

    if (!currentCard || currentCard.stage === targetColumnKey) {
      setDraggingCardId(null);
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    const previousCards = cards;

    setCards((prev) => prev.map((item) => (item.id === cardId ? { ...item, stage: targetColumnKey } : item)));

    try {
      const response = await updateKanbanCard(cardId, { stage: targetColumnKey });
      const updatedCard = response.card;
      setCards((prev) => prev.map((item) => (item.id === updatedCard.id ? updatedCard : item)));
      setDrafts((prev) => ({
        ...prev,
        [updatedCard.id]: {
          ...(prev[updatedCard.id] || createDraft(updatedCard, columns[0]?.key || 'entrada')),
          stage: updatedCard.stage,
        },
      }));
      setSuccessMessage('Cartão movido com sucesso.');
    } catch (error) {
      setCards(previousCards);
      setErrorMessage(error.message);
    } finally {
      setDraggingCardId(null);
    }
  }

  async function handleCreateColumn(event) {
    event.preventDefault();

    const title = newColumnTitle.trim();
    if (!title) {
      return;
    }

    setCreatingColumn(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await createKanbanColumn({ title });
      setNewColumnTitle('');
      await loadBoard();
      setSuccessMessage('Coluna criada com sucesso.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setCreatingColumn(false);
    }
  }

  async function handleDeleteColumn(columnKey) {
    const target = columns.find((column) => column.key === columnKey);

    if (!target) {
      return;
    }

    const confirmed = window.confirm(`Excluir a coluna "${target.title}"?`);

    if (!confirmed) {
      return;
    }

    setDeletingColumnKey(columnKey);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await deleteKanbanColumn(columnKey);
      await loadBoard();
      setSuccessMessage(`Coluna excluída. Cartões movidos para "${result.movedCardsTo}".`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setDeletingColumnKey('');
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
                Quadro com arrasta e solta, além de criação e exclusão de colunas.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[460px]">
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <button
                  type="button"
                  onClick={loadBoard}
                  className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-600"
                >
                  Atualizar quadro
                </button>
              </div>

              <form onSubmit={handleCreateColumn} className="flex gap-2">
                <input
                  type="text"
                  value={newColumnTitle}
                  onChange={(event) => setNewColumnTitle(event.target.value)}
                  placeholder="Nova coluna (ex.: Pós-venda)"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={creatingColumn}
                  className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-600"
                >
                  {creatingColumn ? 'Criando...' : 'Criar coluna'}
                </button>
              </form>
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
            {columns.map((column) => {
              const columnCards = cardsByColumn[column.key] || [];
              const isDragOver = dragOverColumnKey === column.key;

              return (
                <section
                  key={column.key}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverColumnKey(column.key);
                  }}
                  onDragLeave={() => setDragOverColumnKey((current) => (current === column.key ? '' : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDropCard(column.key);
                  }}
                  className={`min-h-[300px] min-w-[320px] flex-1 rounded-xl border p-3 ${
                    isDragOver
                      ? 'border-teal-400 bg-teal-500/10'
                      : 'border-slate-700 bg-slate-800/50'
                  }`}
                >
                  <header className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2 shadow-sm">
                    <span className="text-sm font-semibold text-teal-400">
                      {column.title} ({columnCards.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteColumn(column.key)}
                      disabled={deletingColumnKey === column.key}
                      className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-700"
                    >
                      {deletingColumnKey === column.key ? '...' : 'Excluir'}
                    </button>
                  </header>

                  <div className="space-y-3">
                    {columnCards.map((card) => {
                      const draft = drafts[card.id] || createDraft(card, columns[0]?.key || 'entrada');
                      const company = card.company || {};

                      return (
                        <article
                          key={card.id}
                          draggable
                          onDragStart={() => setDraggingCardId(card.id)}
                          onDragEnd={() => {
                            setDraggingCardId(null);
                            setDragOverColumnKey('');
                          }}
                          className="space-y-3 rounded-lg border border-slate-600 bg-slate-800 p-3 shadow-sm"
                        >
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
                              {columns.map((option) => (
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
