import { useState, useRef, useCallback } from 'react';
import { ThemeProvider } from './theme/ThemeProvider';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Onboarding } from './pages/Onboarding';
import { Settings } from './pages/Settings';
import { Security } from './pages/Security';
import { Chat } from './pages/Chat';
import type { ChatHandle } from './pages/Chat';
import { Channels } from './pages/Channels';
import { Tools } from './pages/Tools';
import { Terminal } from './pages/Terminal';
import type { Page } from '../shared/types';
import './App.css';

function AppContent() {
  const [page, setPage] = useState<Page>('dashboard');
  const chatRef = useRef<ChatHandle>(null);

  return (
    <div className="app-layout">
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className="app-main">
        {page === 'dashboard' && <Dashboard />}
        {page === 'onboarding' && <Onboarding onComplete={() => setPage('dashboard')} />}
        {/* Chat is always mounted but hidden when not active — preserves conversation state */}
        <div style={{ display: page === 'chat' ? 'contents' : 'none' }}>
          <Chat ref={chatRef} />
        </div>
        {page === 'channels' && <Channels />}
        {page === 'security' && <Security />}
        {page === 'tools' && <Tools />}
        {page === 'settings' && <Settings />}
        {page === 'terminal' && <Terminal />}
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
