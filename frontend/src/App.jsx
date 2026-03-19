import { useEffect, useState } from 'react';

import { fetchCurrentUser, login } from './api/client';
import { clearSession, getAuthToken, getAuthUser, saveSession } from './auth/session';
import DashboardPage from './pages/DashboardPage';
import EmailPage from './pages/EmailPage';
import KanbanPage from './pages/KanbanPage';
import LoginPage from './pages/LoginPage';
import CrmPage from './pages/CrmPage';
import WhatsAppInboxPage from './pages/WhatsAppInboxPage';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [authStatus, setAuthStatus] = useState('checking');
  const [authUser, setAuthUser] = useState(() => getAuthUser());
  const [authenticating, setAuthenticating] = useState(false);
  const [authErrorMessage, setAuthErrorMessage] = useState('');

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
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-8">
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-6 py-4 text-sm text-slate-300">
          Validando sessão...
        </div>
      </main>
    );
  }

  if (authStatus !== 'authenticated') {
    return (
      <LoginPage
        onSubmit={handleLogin}
        loading={authenticating}
        errorMessage={authErrorMessage}
      />
    );
  }

  if (currentPage === 'dashboard') {
    return (
      <DashboardPage
        onOpenKanban={() => setCurrentPage('kanban')}
        onOpenWhatsApp={() => setCurrentPage('whatsapp')}
        onOpenEmail={() => setCurrentPage('email')}
        onOpenCrm={() => setCurrentPage('crm')}
        onLogout={handleLogout}
        authUser={authUser}
      />
    );
  }

  if (currentPage === 'kanban') {
    return (
      <KanbanPage
        onOpenDashboard={() => setCurrentPage('dashboard')}
        onOpenWhatsApp={() => setCurrentPage('whatsapp')}
        onOpenEmail={() => setCurrentPage('email')}
        onOpenCrm={() => setCurrentPage('crm')}
        onLogout={handleLogout}
        authUser={authUser}
      />
    );
  }

  if (currentPage === 'email') {
    return (
      <EmailPage
        onOpenDashboard={() => setCurrentPage('dashboard')}
        onOpenKanban={() => setCurrentPage('kanban')}
        onOpenWhatsApp={() => setCurrentPage('whatsapp')}
        onOpenCrm={() => setCurrentPage('crm')}
        onLogout={handleLogout}
        authUser={authUser}
      />
    );
  }

  if (currentPage === 'crm') {
    return (
      <CrmPage
        onOpenDashboard={() => setCurrentPage('dashboard')}
        onOpenKanban={() => setCurrentPage('kanban')}
        onOpenWhatsApp={() => setCurrentPage('whatsapp')}
        onOpenEmail={() => setCurrentPage('email')}
        onLogout={handleLogout}
        authUser={authUser}
      />
    );
  }

  return (
    <WhatsAppInboxPage
      onOpenDashboard={() => setCurrentPage('dashboard')}
      onOpenKanban={() => setCurrentPage('kanban')}
      onOpenEmail={() => setCurrentPage('email')}
      onOpenCrm={() => setCurrentPage('crm')}
      onLogout={handleLogout}
      authUser={authUser}
    />
  );
}

export default App;
