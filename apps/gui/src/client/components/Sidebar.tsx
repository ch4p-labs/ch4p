import { useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import type { Page } from '../../shared/types';
import './Sidebar.css';

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

interface NavItem {
  id: Page;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◆' },
  { id: 'chat', label: 'Chat', icon: '▶' },
  { id: 'channels', label: 'Channels', icon: '⬡' },
  { id: 'security', label: 'Security', icon: '◎' },
  { id: 'tools', label: 'Tools & Skills', icon: '⚙' },
  { id: 'settings', label: 'Settings', icon: '☰' },
  { id: 'terminal', label: 'Terminal', icon: '▪' },
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { theme, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('ch4p-sidebar') === 'collapsed'; } catch { return false; }
  });

  const handleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('ch4p-sidebar', next ? 'collapsed' : 'expanded'); } catch { /* ignore */ }
  };

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">◈</span>
          {!collapsed && <span className="sidebar-logo-text">ch4p</span>}
        </div>
        {!collapsed && <span className="sidebar-version">v0.4.0</span>}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="sidebar-footer">
        {/* Onboarding button */}
        <button
          className={`sidebar-nav-item ${activePage === 'onboarding' ? 'active' : ''}`}
          onClick={() => onNavigate('onboarding')}
          title={collapsed ? 'Setup Wizard' : undefined}
        >
          <span className="sidebar-nav-icon">✦</span>
          {!collapsed && <span className="sidebar-nav-label">Setup Wizard</span>}
        </button>

        {/* Theme toggle */}
        <button className="sidebar-nav-item" onClick={toggle} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          <span className="sidebar-nav-icon">{theme === 'dark' ? '☀' : '☾'}</span>
          {!collapsed && <span className="sidebar-nav-label">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        {/* Collapse toggle */}
        <button className="sidebar-nav-item" onClick={handleCollapse}>
          <span className="sidebar-nav-icon">{collapsed ? '▸' : '◂'}</span>
          {!collapsed && <span className="sidebar-nav-label">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
