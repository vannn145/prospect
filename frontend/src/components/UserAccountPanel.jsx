import { useMemo, useState } from 'react';

import { changePassword } from '../api/client';

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5" aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function formatDisplayName(username) {
  const value = String(username || '').trim();

  if (!value) {
    return 'Usuário';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function UserAccountPanel({ authUser, onLogout, compact = false, className = '' }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const displayName = useMemo(() => formatDisplayName(authUser?.username), [authUser?.username]);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage('Preencha a senha atual, a nova senha e a confirmação.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('A confirmação da nova senha não confere.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const response = await changePassword({
        currentPassword,
        newPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage(response.message || 'Senha alterada com sucesso.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`w-full rounded-xl border border-slate-700 bg-slate-900/70 p-4 shadow-sm ${className}`}>
      <div className={`flex gap-3 ${compact ? 'items-center justify-between' : 'flex-col sm:flex-row sm:items-center sm:justify-between'}`}>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center justify-center rounded-full bg-teal-500/15 text-teal-300 ${compact ? 'h-9 w-9' : 'h-11 w-11'}`}>
            <IconUser />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-100">{displayName}</p>
            <p className="text-xs text-slate-400">@{authUser?.username || 'usuario'}</p>
          </div>
        </div>

        <div className={`flex flex-wrap gap-2 ${compact ? 'justify-end' : ''}`}>
          <button
            type="button"
            onClick={() => {
              setIsExpanded((prev) => !prev);
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            {isExpanded ? 'Fechar senha' : 'Alterar senha'}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            Sair
          </button>
        </div>
      </div>

      {isExpanded && (
        <form className="mt-4 space-y-3 border-t border-slate-700 pt-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="current-password">
              Senha atual
            </label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
              placeholder="Digite a senha atual"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="new-password">
              Nova senha
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
              placeholder="Digite a nova senha"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="confirm-password">
              Confirmar nova senha
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
              placeholder="Repita a nova senha"
            />
          </div>

          {(errorMessage || successMessage) && (
            <div
              className={`rounded-lg border px-3 py-2 text-xs ${
                errorMessage
                  ? 'border-rose-700 bg-rose-950 text-rose-300'
                  : 'border-emerald-700 bg-emerald-950 text-emerald-300'
              }`}
            >
              {errorMessage || successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      )}
    </div>
  );
}

export default UserAccountPanel;