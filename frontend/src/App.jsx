import { useEffect, useState } from 'react';

import { fetchCurrentUser, login } from './api/client';
import { clearSession, getAuthToken, getAuthUser, saveSession } from './auth/session';
import DashboardPage from './pages/DashboardPage';
import EmailPage from './pages/EmailPage';
import KanbanPage from './pages/KanbanPage';
import LoginPage from './pages/LoginPage';
import CrmPage from './pages/CrmPage';
import WhatsAppInboxPage from './pages/WhatsAppInboxPage';

const THEME_STORAGE_KEY = 'prospect-theme';

function getInitialTheme() {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

function ThemeToggleButton({ theme, onToggle }) {
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={onToggle}
      className="fixed right-4 top-4 z-50 rounded-full border border-slate-500 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur hover:bg-white"
    >
      {isDark ? '☀️ Modo claro' : '🌙 Modo escuro'}
    </button>
  );
}

function SideNavigation({ currentPage, onNavigate, isOpen, onToggle, theme, onToggleTheme, onLogout }) {
  const isDark = theme === 'dark';

  const items = [
    { key: 'dashboard', label: 'Dashboard', icon: '⌂' },
    { key: 'kanban', label: 'Kanban', icon: '▦' },
    { key: 'whatsapp', label: 'WhatsApp', icon: '◔' },
    { key: 'email', label: 'Email', icon: '✉' },
    { key: 'crm', label: 'Analytics', icon: '◷' },
  ];

  return (
    <aside
      className={`fixed left-4 top-8 z-50 flex h-[calc(100vh-4rem)] flex-col rounded-2xl border p-3 backdrop-blur transition-all duration-300 ${
        isOpen ? 'w-64' : 'w-20'
      } ${
        isDark
          ? 'border-slate-700 bg-slate-900/95 text-slate-100'
          : 'border-slate-200 bg-white/95 text-slate-700 shadow-lg'
      }`}
    >
      <div className="relative flex items-center gap-3 px-1 py-2">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-sm font-bold text-white">
          KL
        </span>
        {isOpen && (
          <div>
            <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Keula</p>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Web developer</p>
          </div>
        )}

        <button
          type="button"
          onClick={onToggle}
          className={`absolute -right-5 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm ${
            isDark
              ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
              : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}
        >
          {isOpen ? '‹' : '›'}
        </button>
      </div>

      <button
        type="button"
        className={`mt-3 flex h-10 w-full items-center gap-2 rounded-xl border px-3 ${
          isDark
            ? 'border-slate-700 bg-slate-800 text-slate-300'
            : 'border-slate-200 bg-slate-100 text-slate-500'
        }`}
      >
        <span className="text-base">⌕</span>
        {isOpen && <span className="text-sm">Search...</span>}
      </button>

      <nav className="mt-4 space-y-2">
        {items.map((item) => {
          const active = item.key === currentPage;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? 'bg-indigo-500 text-white'
                  : isDark
                  ? 'bg-transparent text-slate-300 hover:bg-slate-800'
                  : 'bg-transparent text-slate-700 hover:bg-slate-100'
              }`}
              title={item.label}
            >
              <span className="text-base">{item.icon}</span>
              {isOpen && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className={`mt-auto space-y-2 border-t pt-3 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <button
          type="button"
          onClick={onLogout}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
            isDark
              ? 'text-slate-200 hover:bg-slate-800'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className="text-base">↪</span>
          {isOpen && <span>Logout</span>}
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-semibold ${
            isDark
              ? 'border-slate-700 bg-slate-800 text-slate-200'
              : 'border-slate-200 bg-slate-100 text-slate-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <span>{isDark ? '☀' : '☾'}</span>
            {isOpen && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
          </span>
          <span className={`relative inline-flex h-5 w-10 items-center rounded-full ${isDark ? 'bg-indigo-500' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${isDark ? 'translate-x-5' : 'translate-x-1'}`} />
          </span>
        </button>
      </div>
    </aside>
  );
}

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [authStatus, setAuthStatus] = useState('checking');
  const [authUser, setAuthUser] = useState(() => getAuthUser());
  const [authenticating, setAuthenticating] = useState(false);
  const [authErrorMessage, setAuthErrorMessage] = useState('');
  const [theme, setTheme] = useState(getInitialTheme);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  function handleToggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  function withThemeToggle(content) {
    return (
      <>
        <ThemeToggleButton theme={theme} onToggle={handleToggleTheme} />
        {content}
      </>
    );
  }

  function withAuthenticatedChrome(content) {
    return (
      <>
        <SideNavigation
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen((prev) => !prev)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onLogout={handleLogout}
        />
        <div className={`transition-all duration-300 ${isSidebarOpen ? 'lg:pl-72' : 'lg:pl-28'}`}>
          {content}
        </div>
      </>
    );
  }

  useEffect(() => {
    const token = getAuthToken();

    if (!token) {
      setAuthStatus('anonymous');
      return;
    }

    let mounted = true;

    fetchCurrentUser()
      .then((response) => {
        if (!mounted) {
          return;
        }

        const user = response.user || getAuthUser();
        setAuthUser(user);
        setAuthStatus('authenticated');
      })
      .catch(() => {
        if (!mounted) {
          return;
        }

        clearSession();
        setAuthUser(null);
        setAuthStatus('anonymous');
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function handleLogin(credentials) {
    setAuthenticating(true);
    setAuthErrorMessage('');

    try {
      const response = await login(credentials);
      saveSession(response.token, response.user);
      setAuthUser(response.user);
      setCurrentPage('dashboard');
      setAuthStatus('authenticated');
    } catch (error) {
      setAuthErrorMessage(error.message);
    } finally {
      setAuthenticating(false);
    }
  }

  function handleLogout() {
    clearSession();
    setAuthUser(null);
    setCurrentPage('dashboard');
    setAuthStatus('anonymous');
    setAuthErrorMessage('');
  }

  if (authStatus === 'checking') {
    return withThemeToggle(
      <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-8">
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-6 py-4 text-sm text-slate-300">
          Validando sessão...
        </div>
      </main>
    );
  }

  if (authStatus !== 'authenticated') {
    return withThemeToggle(
      <LoginPage
        onSubmit={handleLogin}
        loading={authenticating}
        errorMessage={authErrorMessage}
      />
    );
  }

  if (currentPage === 'dashboard') {
    return withAuthenticatedChrome(
      <DashboardPage
        onLogout={handleLogout}
        authUser={authUser}
      />
    );
  }

  if (currentPage === 'kanban') {
    return withAuthenticatedChrome(
      <KanbanPage
        onLogout={handleLogout}
        authUser={authUser}
      />
    );
  }

  if (currentPage === 'email') {
    return withAuthenticatedChrome(
      <EmailPage
        onLogout={handleLogout}
        authUser={authUser}
      />
    );
  }

  if (currentPage === 'crm') {
    return withAuthenticatedChrome(
      <CrmPage
        onLogout={handleLogout}
        authUser={authUser}
      />
    );
  }

  return withAuthenticatedChrome(
    <WhatsAppInboxPage
      onLogout={handleLogout}
      authUser={authUser}
    />
  );
}

export default App;
