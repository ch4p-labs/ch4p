import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Select } from '../components/Select';
import type { SafeConfig } from '../../shared/types';
import './Settings.css';

// ---------------------------------------------------------------------------
// Editable field component
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  value: string | number | boolean;
  type?: 'text' | 'number' | 'toggle' | 'select';
  options?: { value: string; label: string }[];
  onChange: (value: string | number | boolean) => void;
  mono?: boolean;
}

function SettingField({ label, value, type = 'text', options, onChange, mono }: FieldProps) {
  if (type === 'toggle') {
    return (
      <div className="setting-row">
        <span className="setting-label">{label}</span>
        <button
          className={`setting-toggle ${value ? 'on' : 'off'}`}
          onClick={() => onChange(!value)}
        >
          <span className="setting-toggle-thumb" />
          <span className="setting-toggle-text">{value ? 'On' : 'Off'}</span>
        </button>
      </div>
    );
  }

  if (type === 'select' && options) {
    return (
      <div className="setting-row">
        <span className="setting-label">{label}</span>
        <Select
          value={String(value)}
          options={options}
          onChange={v => onChange(v)}
        />
      </div>
    );
  }

  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <input
        className={`setting-input ${mono ? 'mono' : ''}`}
        type={type === 'number' ? 'number' : 'text'}
        value={String(value)}
        onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

export function Settings() {
  const config = useApi<SafeConfig>('/api/config');
  const [draft, setDraft] = useState<SafeConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Re-sync draft from server data whenever config.data identity changes,
  // unless the user has unsaved edits (then we keep their draft).
  useEffect(() => {
    if (!config.data) return;
    if (!draft || !dirty) {
      setDraft(config.data);
    }
  }, [config.data, draft, dirty]);

  const update = <S extends keyof SafeConfig>(
    section: S,
    key: keyof SafeConfig[S],
    value: SafeConfig[S][keyof SafeConfig[S]],
  ) => {
    if (!draft) return;
    setDraft({
      ...draft,
      [section]: { ...draft[section], [key]: value },
    });
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json() as SafeConfig;
      setDraft(data);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (config.loading) return <div className="settings"><p className="loading-text">Loading settings...</p></div>;
  if (config.error) return <div className="settings"><p className="error-text">{config.error}</p></div>;
  if (!draft) return null;

  return (
    <div className="settings">
      <div className="settings-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure your ch4p runtime</p>
        </div>
        <div className="settings-actions">
          {saved && <span className="settings-saved">Saved</span>}
          {error && <span className="settings-error">{error}</span>}
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
            Save Changes
          </Button>
        </div>
      </div>

      <div className="settings-grid">
        <Card title="Agent">
          <SettingField
            label="Model"
            value={draft.agent.model}
            onChange={v => update('agent', 'model', v as string)}
            mono
          />
          <SettingField
            label="Provider"
            value={draft.agent.provider}
            type="select"
            options={[
              { value: 'anthropic', label: 'Anthropic' },
              { value: 'openai', label: 'OpenAI' },
              { value: 'google', label: 'Google AI' },
              { value: 'openrouter', label: 'OpenRouter' },
              { value: 'bedrock', label: 'AWS Bedrock' },
              { value: 'ollama', label: 'Ollama' },
            ]}
            onChange={v => update('agent', 'provider', v as string)}
          />
          <SettingField
            label="Thinking Level"
            value={draft.agent.thinkingLevel ?? 'medium'}
            type="select"
            options={[
              { value: 'none', label: 'None' },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
            onChange={v => update('agent', 'thinkingLevel', v as string)}
          />
        </Card>

        <Card title="Gateway">
          <SettingField
            label="Port"
            value={draft.gateway.port}
            type="number"
            onChange={v => update('gateway', 'port', v as number)}
          />
          <SettingField
            label="Require Pairing"
            value={draft.gateway.requirePairing}
            type="toggle"
            onChange={v => update('gateway', 'requirePairing', v as boolean)}
          />
          <SettingField
            label="Allow Public Bind"
            value={draft.gateway.allowPublicBind}
            type="toggle"
            onChange={v => update('gateway', 'allowPublicBind', v as boolean)}
          />
        </Card>

        <Card title="Memory">
          <SettingField
            label="Backend"
            value={draft.memory.backend}
            type="select"
            options={[
              { value: 'sqlite', label: 'SQLite' },
              { value: 'json', label: 'JSON' },
              { value: 'none', label: 'Disabled' },
            ]}
            onChange={v => update('memory', 'backend', v as string)}
          />
          <SettingField
            label="Auto-save"
            value={draft.memory.autoSave}
            type="toggle"
            onChange={v => update('memory', 'autoSave', v as boolean)}
          />
        </Card>

        <Card title="Autonomy">
          <SettingField
            label="Level"
            value={draft.autonomy.level}
            type="select"
            options={[
              { value: 'readonly', label: 'Read-only' },
              { value: 'supervised', label: 'Supervised' },
              { value: 'full', label: 'Full' },
            ]}
            onChange={v => update('autonomy', 'level', v as string)}
          />
        </Card>

        <Card title="Observability">
          <SettingField
            label="Log Level"
            value={draft.observability.logLevel}
            type="select"
            options={[
              { value: 'debug', label: 'Debug' },
              { value: 'info', label: 'Info' },
              { value: 'warn', label: 'Warn' },
              { value: 'error', label: 'Error' },
            ]}
            onChange={v => update('observability', 'logLevel', v as string)}
          />
        </Card>

        <Card title="Tunnel">
          <SettingField
            label="Provider"
            value={draft.tunnel.provider}
            type="select"
            options={[
              { value: 'none', label: 'Disabled' },
              { value: 'cloudflare', label: 'Cloudflare' },
              { value: 'ngrok', label: 'ngrok' },
              { value: 'localtunnel', label: 'localtunnel' },
            ]}
            onChange={v => update('tunnel', 'provider', v as string)}
          />
        </Card>

        <Card title="Security">
          <SettingField
            label="Encrypt Secrets"
            value={draft.secrets.encrypt}
            type="toggle"
            onChange={v => update('secrets', 'encrypt', v as boolean)}
          />
        </Card>

        <Card title="Skills">
          <SettingField
            label="Enabled"
            value={draft.skills.enabled}
            type="toggle"
            onChange={v => update('skills', 'enabled', v as boolean)}
          />
        </Card>
      </div>
    </div>
  );
}
