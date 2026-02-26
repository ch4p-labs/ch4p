/**
 * SettingsPanel — inline settings form for editing gateway config fields.
 *
 * Fetches the current safe config from GET /config on mount and renders
 * labeled form controls for each editable field. On submit, sends the
 * changes to PATCH /config and shows a persistent toast asking the user
 * to restart the gateway.
 *
 * Only safe fields (no API keys) are shown or accepted.
 */

import { useState, useEffect } from 'react';
import { useSettings } from './useSettings.js';
import type { SafeConfig } from './useSettings.js';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { config, loading, saving, error, saveResult, save } = useSettings();

  // Local form state — initialised from fetched config.
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState('');
  const [requirePairing, setRequirePairing] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const [autonomyLevel, setAutonomyLevel] = useState('');
  const [logLevel, setLogLevel] = useState('');
  const [skillsEnabled, setSkillsEnabled] = useState(false);
  const [tunnelProvider, setTunnelProvider] = useState('');

  // Sync form state from fetched config.
  useEffect(() => {
    if (!config) return;
    setModel(config.agent.model ?? '');
    setProvider(config.agent.provider ?? '');
    setThinkingLevel(config.agent.thinkingLevel ?? '');
    setRequirePairing(config.gateway.requirePairing ?? false);
    setAutoSave(config.memory.autoSave ?? false);
    setAutonomyLevel(config.autonomy.level ?? '');
    setLogLevel(config.observability.logLevel ?? '');
    setSkillsEnabled(config.skills.enabled ?? false);
    setTunnelProvider(config.tunnel.provider ?? '');
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const updates: Partial<SafeConfig> = {
      agent: {
        model,
        provider,
        ...(thinkingLevel && { thinkingLevel: thinkingLevel as 'low' | 'medium' | 'high' }),
      },
      gateway: { requirePairing },
      memory: { autoSave },
      autonomy: { level: autonomyLevel as 'readonly' | 'supervised' | 'full' },
      observability: { logLevel: logLevel as 'debug' | 'info' | 'warn' | 'error' },
      skills: { enabled: skillsEnabled },
      tunnel: { provider: tunnelProvider },
    };
    await save(updates);
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <span className="settings-title">Settings</span>
        <button className="settings-close-btn" onClick={onClose} aria-label="Close settings">✕</button>
      </div>

      {loading && <div className="settings-loading">Loading…</div>}

      {error && (
        <div className="settings-error">
          {error}
        </div>
      )}

      {saveResult && (
        <div className="settings-save-result">
          {saveResult}
        </div>
      )}

      {!loading && config && (
        <form className="settings-form" onSubmit={handleSubmit}>
          <div className="settings-section">
            <div className="settings-section-title">Agent</div>

            <label className="settings-field">
              <span className="settings-label">Model</span>
              <input
                className="settings-input"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>

            <label className="settings-field">
              <span className="settings-label">Provider</span>
              <input
                className="settings-input"
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </label>

            <label className="settings-field">
              <span className="settings-label">Thinking Level</span>
              <select
                className="settings-select"
                value={thinkingLevel}
                onChange={(e) => setThinkingLevel(e.target.value)}
              >
                <option value="">default</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Gateway</div>

            <label className="settings-field settings-field-inline">
              <input
                type="checkbox"
                checked={requirePairing}
                onChange={(e) => setRequirePairing(e.target.checked)}
              />
              <span className="settings-label">Require pairing token</span>
            </label>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Memory</div>

            <label className="settings-field settings-field-inline">
              <input
                type="checkbox"
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
              />
              <span className="settings-label">Auto-save memory</span>
            </label>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Autonomy</div>

            <label className="settings-field">
              <span className="settings-label">Level</span>
              <select
                className="settings-select"
                value={autonomyLevel}
                onChange={(e) => setAutonomyLevel(e.target.value)}
              >
                <option value="readonly">readonly</option>
                <option value="supervised">supervised</option>
                <option value="full">full</option>
              </select>
            </label>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Observability</div>

            <label className="settings-field">
              <span className="settings-label">Log Level</span>
              <select
                className="settings-select"
                value={logLevel}
                onChange={(e) => setLogLevel(e.target.value)}
              >
                <option value="debug">debug</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>
            </label>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Skills</div>

            <label className="settings-field settings-field-inline">
              <input
                type="checkbox"
                checked={skillsEnabled}
                onChange={(e) => setSkillsEnabled(e.target.checked)}
              />
              <span className="settings-label">Enable skills</span>
            </label>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Tunnel</div>

            <label className="settings-field">
              <span className="settings-label">Provider</span>
              <input
                className="settings-input"
                type="text"
                value={tunnelProvider}
                onChange={(e) => setTunnelProvider(e.target.value)}
              />
            </label>
          </div>

          <div className="settings-actions">
            <button
              type="submit"
              className="settings-save-btn"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
