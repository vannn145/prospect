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

function SideNavigation({ currentPage, onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);

  const items = [
    { key: 'dashboard', label: 'Painel', icon: '🏠' },
    { key: 'kanban', label: 'Kanban', icon: '🗂️' },
    { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
    { key: 'email', label: 'Email', icon: '✉️' },
    { key: 'crm', label: 'CRM', icon: '📈' },
  ];

  return (
    <aside
      className={`fixed left-4 top-20 z-50 rounded-2xl border border-slate-500 bg-white/95 p-2 shadow-md backdrop-blur transition-all ${
        isOpen ? 'w-52' : 'w-14'
      }`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="mb-2 flex h-10 w-full items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-lg hover:bg-slate-200"
        aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}
      >
        ☰
      </button>

      <nav className="space-y-1">
        {items.map((item) => {
          const active = item.key === currentPage;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                active
                  ? 'bg-teal-500 text-white'
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
    return withThemeToggle(
      <>
        <SideNavigation currentPage={currentPage} onNavigate={setCurrentPage} />
        {content}
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
