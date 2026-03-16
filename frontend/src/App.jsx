import { useState } from 'react';

import DashboardPage from './pages/DashboardPage';
import KanbanPage from './pages/KanbanPage';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  return currentPage === 'dashboard' ? (
    <DashboardPage onOpenKanban={() => setCurrentPage('kanban')} />
  ) : (
    <KanbanPage onOpenDashboard={() => setCurrentPage('dashboard')} />
  );
}

export default App;
