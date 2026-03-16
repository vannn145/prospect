import { getCategoryLabel, getStatusSiteLabel } from '../utils/labels';

function IconWhatsapp() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path
        d="M20.52 3.48A11.88 11.88 0 0 0 12.06.02C5.58.02.3 5.3.3 11.78a11.7 11.7 0 0 0 1.6 5.93L.02 24l6.47-1.83a11.76 11.76 0 0 0 5.57 1.41h.01c6.48 0 11.76-5.28 11.76-11.76 0-3.14-1.22-6.09-3.3-8.34Zm-8.46 18.1h-.01a9.82 9.82 0 0 1-5.02-1.38l-.36-.22-3.84 1.08 1.1-3.75-.24-.39a9.76 9.76 0 0 1-1.5-5.14C2.2 6.37 6.65 1.92 12.06 1.92c2.62 0 5.08 1.03 6.92 2.9a9.76 9.76 0 0 1 2.86 6.96c0 5.4-4.4 9.8-9.78 9.8Zm5.37-7.34c-.3-.15-1.75-.86-2.03-.95-.27-.1-.47-.15-.67.15-.2.3-.77.95-.95 1.15-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.48-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.5h-.57c-.2 0-.52.08-.8.37-.27.3-1.05 1.02-1.05 2.5 0 1.47 1.08 2.9 1.23 3.1.15.2 2.13 3.25 5.15 4.56.72.3 1.28.48 1.72.62.72.23 1.37.2 1.89.12.58-.08 1.75-.72 2-1.42.24-.7.24-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z"
      />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" strokeWidth="1.8" />
      <rect x="5" y="5" width="10" height="10" rx="2" strokeWidth="1.8" />
    </svg>
  );
}

function IconKanban() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden="true">
      <rect x="4" y="5" width="4" height="14" rx="1" strokeWidth="1.8" />
      <rect x="10" y="8" width="4" height="11" rx="1" strokeWidth="1.8" />
      <rect x="16" y="11" width="4" height="8" rx="1" strokeWidth="1.8" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m5 13 4 4L19 7" />
    </svg>
  );
}

function IconLoading() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className="h-4 w-4 animate-spin"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" />
      <path strokeLinecap="round" strokeWidth="2" d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

function normalizePhone(phone) {
  if (!phone) {
    return '';
  }

  return String(phone).replace(/\D/g, '');
}

function getWhatsappLink(phone) {
  const digits = normalizePhone(phone);
  if (!digits) {
    return null;
  }

  const withCountryCode = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${withCountryCode}`;
}

function statusBadgeClass(statusSite) {
  if (statusSite === 'sem_site') {
    return 'bg-rose-100 text-rose-700';
  }

  if (statusSite === 'site_fraco') {
    return 'bg-amber-100 text-amber-700';
  }

  return 'bg-emerald-100 text-emerald-700';
}

function LeadsTable({
  leads,
  onMarkContacted,
  onCopyMessage,
  onSendMetaMessage,
  onAddToKanban,
  onFindInstagram,
  contactingId,
  addingKanbanId,
  findingInstagramId,
  sendingMetaMessageId,
  metaMessagingEnabled,
}) {
  if (!leads.length) {
    return (
        <div className="rounded-xl border border-dashed border-slate-600 bg-slate-800 p-8 text-center text-slate-400">
        Nenhum contato encontrado para os filtros atuais.
      </div>
    );
  }

  return (
      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800 shadow-sm">
        <table className="min-w-full divide-y divide-slate-700 text-sm">
          <thead className="bg-slate-900">
          <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Nome</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Telefone</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Cidade</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Categoria</th>
              <th className="min-w-[220px] px-4 py-3 text-left font-semibold text-slate-300">Status do site</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Site</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Instagram</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Ações</th>
          </tr>
        </thead>

          <tbody className="divide-y divide-slate-700">
          {leads.map((lead) => {
            const whatsappLink = getWhatsappLink(lead.phone);
            const canUseMetaMessaging = Boolean(onSendMetaMessage && metaMessagingEnabled);
            const isSendingMetaMessage = sendingMetaMessageId === lead.id;

            return (
                <tr key={lead.id} className={lead.contacted ? 'bg-slate-900/60' : 'bg-slate-800'}>
                  <td className="px-4 py-3 font-medium text-slate-200">{lead.name}</td>
                  <td className="px-4 py-3 text-slate-300">{lead.phone || '-'}</td>
                  <td className="px-4 py-3 text-slate-300">{lead.city}</td>
                  <td className="px-4 py-3 text-slate-300">{getCategoryLabel(lead.category)}</td>
                <td className="min-w-[220px] px-4 py-3 align-middle text-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(lead.status_site)}`}>
                      {getStatusSiteLabel(lead.status_site)}
                    </span>
                    {lead.possible_no_website && !lead.contacted && (
                      <span className="inline-flex whitespace-nowrap rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-700">
                        prioritário
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {lead.website ? (
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noreferrer"
                        className="text-teal-400 underline hover:text-teal-300"
                    >
                      Abrir site
                    </a>
                  ) : (
                      <span className="text-slate-500">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {lead.instagram_url ? (
                    <a
                      href={lead.instagram_url}
                      target="_blank"
                      rel="noreferrer"
                        className="text-teal-400 underline hover:text-teal-300"
                    >
                      Abrir
                    </a>
                  ) : onFindInstagram ? (
                    <button
                      type="button"
                      onClick={() => onFindInstagram(lead.id)}
                      disabled={findingInstagramId === lead.id}
                        className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-600"
                    >
                      {findingInstagramId === lead.id ? 'Buscando...' : 'Buscar'}
                    </button>
                  ) : (
                      <span className="text-slate-500">-</span>
                  )}
                </td>
                <td className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {canUseMetaMessaging ? (
                      <button
                        type="button"
                        onClick={() => onSendMetaMessage(lead)}
                        disabled={!lead.phone || isSendingMetaMessage}
                        title={
                          !lead.phone
                            ? 'Sem telefone para WhatsApp'
                            : isSendingMetaMessage
                            ? 'Enviando mensagem via Meta...'
                            : 'Enviar mensagem via Meta'
                        }
                        aria-label={
                          !lead.phone
                            ? 'Sem telefone para WhatsApp'
                            : isSendingMetaMessage
                            ? 'Enviando mensagem via Meta...'
                            : 'Enviar mensagem via Meta'
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-green-600 text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-slate-600"
                      >
                        {isSendingMetaMessage ? <IconLoading /> : <IconWhatsapp />}
                      </button>
                    ) : (
                      <a
                        href={whatsappLink || '#'}
                        onClick={!whatsappLink ? (event) => event.preventDefault() : undefined}
                        target={whatsappLink ? '_blank' : undefined}
                        rel={whatsappLink ? 'noreferrer' : undefined}
                        title={whatsappLink ? 'Abrir WhatsApp' : 'Sem telefone para WhatsApp'}
                        aria-label={whatsappLink ? 'Abrir WhatsApp' : 'Sem telefone para WhatsApp'}
                        aria-disabled={!whatsappLink}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-white ${
                          whatsappLink
                            ? 'bg-green-600 hover:bg-green-500'
                            : 'cursor-not-allowed bg-slate-600'
                        }`}
                      >
                        <IconWhatsapp />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => onCopyMessage(lead)}
                      title="Copiar mensagem"
                      aria-label="Copiar mensagem"
                       className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-600 text-white hover:bg-slate-500"
                    >
                      <IconCopy />
                    </button>

                    <button
                      type="button"
                      onClick={() => onAddToKanban(lead.id)}
                      disabled={addingKanbanId === lead.id}
                      title={addingKanbanId === lead.id ? 'Incluindo no Kanban...' : 'Incluir no Kanban'}
                      aria-label={addingKanbanId === lead.id ? 'Incluindo no Kanban...' : 'Incluir no Kanban'}
                       className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-teal-600 text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-600"
                    >
                      {addingKanbanId === lead.id ? <IconLoading /> : <IconKanban />}
                    </button>

                    <button
                      type="button"
                      onClick={() => onMarkContacted(lead.id)}
                      disabled={lead.contacted || contactingId === lead.id}
                      title={
                        lead.contacted
                          ? 'Contato já marcado como contatado'
                          : contactingId === lead.id
                          ? 'Marcando como contatado...'
                          : 'Marcar como contatado'
                      }
                      aria-label={
                        lead.contacted
                          ? 'Contato já marcado como contatado'
                          : contactingId === lead.id
                          ? 'Marcando como contatado...'
                          : 'Marcar como contatado'
                      }
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-white disabled:cursor-not-allowed disabled:bg-slate-300 ${
                        lead.contacted ? 'bg-green-700' : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                    >
                      {contactingId === lead.id ? <IconLoading /> : <IconCheck />}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default LeadsTable;
