import { useState } from 'react';
import { ThemeProvider } from './theme/ThemeProvider';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Onboarding } from './pages/Onboarding';
import type { Page } from '../shared/types';
import './App.css';

function Placeholder({ name }: { name: string }) {
  return (
    <div className="placeholder-page">
      <h2 className="placeholder-title">{name}</h2>
      <p className="placeholder-text">Coming soon — Phase 2+</p>
    </div>
  );
}

function AppContent() {
  const [page, setPage] = useState<Page>('dashboard');

  return (
    <div className="app-layout">
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className="app-main">
        {page === 'dashboard' && <Dashboard />}
        {page === 'onboarding' && <Onboarding onComplete={() => setPage('dashboard')} />}
        {page === 'chat' && <Placeholder name="Chat" />}
        {page === 'channels' && <Placeholder name="Channels" />}
        {page === 'security' && <Placeholder name="Security Audit" />}
        {page === 'tools' && <Placeholder name="Tools & Skills" />}
        {page === 'settings' && <Placeholder name="Settings" />}
        {page === 'terminal' && <Placeholder name="Terminal" />}
      </main>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
