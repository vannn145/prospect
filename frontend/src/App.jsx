import { useEffect, useState } from 'react';

import { fetchCurrentUser, login } from './api/client';
import { clearSession, getAuthToken, getAuthUser, saveSession } from './auth/session';
import DashboardPage from './pages/DashboardPage';
import EmailPage from './pages/EmailPage';
import KanbanPage from './pages/KanbanPage';
import LoginPage from './pages/LoginPage';
import CrmPage from './pages/CrmPage';
import WhatsAppInboxPage from './pages/WhatsAppInboxPage';
import UserAccountPanel from './components/UserAccountPanel';

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

function SideNavigation({ currentPage, onNavigate, isOpen, onToggle, theme, onToggleTheme, onLogout, authUser }) {
  const isDark = theme === 'dark';
  const accountPanelClass = isDark
    ? 'border-slate-600 bg-slate-800/70 p-3'
    : 'border-slate-200 bg-slate-100 p-3';

  function Icon({ type, className = 'h-5 w-5' }) {
    if (type === 'dashboard') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5" />
          <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M5.25 9.75V21h13.5V9.75" />
        </svg>
      );
    }

    if (type === 'kanban') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <rect x="3" y="4" width="18" height="16" rx="2" strokeWidth="1.8" />
          <path strokeWidth="1.8" strokeLinecap="round" d="M9 4v16M15 4v16" />
        </svg>
      );
    }

    if (type === 'whatsapp') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M20 11.5A8.5 8.5 0 0 1 7.5 19L4 20l1-3.2A8.5 8.5 0 1 1 20 11.5Z" />
          <path strokeWidth="1.8" strokeLinecap="round" d="M9.5 10.2c.3 1.5 2.2 3.3 3.8 3.7" />
        </svg>
      );
    }

    if (type === 'email') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <rect x="3" y="5" width="18" height="14" rx="2" strokeWidth="1.8" />
          <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="m4 7 8 6 8-6" />
        </svg>
      );
    }

    if (type === 'analytics') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M4 19h16" />
          <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M7 15v-4m5 4V7m5 8v-6" />
        </svg>
      );
    }

    if (type === 'search') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <circle cx="11" cy="11" r="6" strokeWidth="1.8" />
          <path strokeWidth="1.8" strokeLinecap="round" d="m20 20-4.2-4.2" />
        </svg>
      );
    }

    return null;
  }

  const items = [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { key: 'kanban', label: 'Kanban', icon: 'kanban' },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp' },
    { key: 'email', label: 'Email', icon: 'email' },
    { key: 'crm', label: 'Analytics', icon: 'analytics' },
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
      <div className="relative h-10">
        <button
          type="button"
          onClick={onToggle}
          className={`absolute -right-5 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm ${
            isDark
              ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
              : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}
        >
          {isOpen ? '‹' : '›'}
        </button>
      </div>

      {isOpen && (
        <UserAccountPanel
          authUser={authUser}
          onLogout={onLogout}
          compact
          className={accountPanelClass}
        />
      )}

      <button
        type="button"
        className={`mt-3 flex h-10 w-full items-center gap-2 rounded-xl border px-3 ${
          isDark
            ? 'border-slate-700 bg-slate-800 text-slate-300'
            : 'border-slate-200 bg-slate-100 text-slate-500'
        }`}
      >
        <Icon type="search" className="h-4 w-4" />
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
                  ? 'bg-teal-500 text-white'
                  : isDark
                  ? 'bg-transparent text-slate-300 hover:bg-slate-800'
                  : 'bg-transparent text-slate-700 hover:bg-slate-100'
              }`}
              title={item.label}
            >
              <Icon type={item.icon} className="h-5 w-5" />
              {isOpen && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className={`mt-auto space-y-2 border-t pt-3 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>

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
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs">
              {isDark ? '☀' : '☾'}
            </span>
            {isOpen && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
          </span>
          <span className={`relative inline-flex h-5 w-10 items-center rounded-full ${isDark ? 'bg-teal-500' : 'bg-slate-300'}`}>
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
          authUser={authUser}
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
    return withAuthenticatedChrome(<DashboardPage />);
  }

  if (currentPage === 'kanban') {
    return withAuthenticatedChrome(<KanbanPage />);
  }

  if (currentPage === 'email') {
    return withAuthenticatedChrome(<EmailPage />);
  }

  if (currentPage === 'crm') {
    return withAuthenticatedChrome(<CrmPage />);
  }

  return withAuthenticatedChrome(<WhatsAppInboxPage />);
}

export default App;
