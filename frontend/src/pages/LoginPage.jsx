import { useState } from 'react';

function LoginPage({ onSubmit, loading, errorMessage }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit({ username, password });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-8">
      <section className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
        <div className="mb-6 text-center">
          <img src="/logo-keula.svg" alt="Keula" className="mx-auto h-14 w-auto" />
          <h1 className="mt-4 text-2xl font-bold text-slate-100">Entrar no Prospect</h1>
          <p className="mt-2 text-sm text-slate-400">Informe usuário e senha para acessar o painel.</p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-rose-700 bg-rose-950 px-4 py-3 text-sm text-rose-300">
            {errorMessage}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="username">
              Usuário
            </label>
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
              placeholder="Digite seu usuário"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
              placeholder="Digite sua senha"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default LoginPage;
