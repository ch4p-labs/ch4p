import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import type {
  DetectedEngine, ChannelDef, ModelChoice, OnboardResponse,
} from '../../shared/types';
import './Onboarding.css';

// ---------------------------------------------------------------------------
// Types for wizard state
// ---------------------------------------------------------------------------

interface EnginesData {
  engines: DetectedEngine[];
  models: ModelChoice[];
  channels: ChannelDef[];
  autonomyLevels: { id: string; label: string; description: string }[];
}

type StepId =
  | 'welcome'
  | 'engine'
  | 'provider'
  | 'apikey'
  | 'model'
  | 'autonomy'
  | 'channels'
  | 'channel-config'
  | 'features'
  | 'review'
  | 'complete';

/** Maps engine IDs to their implicit provider (for model filtering). */
const ENGINE_PROVIDER: Record<string, string> = {
  'claude-cli': 'anthropic',
  'codex-cli': 'openai',
  'ollama': 'ollama',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const engines = useApi<EnginesData>('/api/engines');

  // Wizard state
  const [step, setStep] = useState<StepId>('welcome');
  const [selectedEngine, setSelectedEngine] = useState('');
  const [useApiKey, setUseApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedAutonomy, setSelectedAutonomy] = useState('supervised');
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [channelConfigs, setChannelConfigs] = useState<Record<string, Record<string, string>>>({});
  const [configChannelIdx, setConfigChannelIdx] = useState(0);
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardResponse | null>(null);

  // Compute visible steps based on engine selection
  const needsApiKey = useApiKey;
  const visibleSteps: StepId[] = [
    'welcome', 'engine',
    // API key path: pick provider → enter key → pick model
    ...(needsApiKey ? ['provider' as StepId, 'apikey' as StepId] : []),
    // Model selection is always shown (CLI engines have implicit provider)
    'model',
    'autonomy', 'channels',
    ...(selectedChannels.size > 0 ? ['channel-config' as StepId] : []),
    'features', 'review',
  ];

  // Derive the effective provider for model filtering
  const effectiveProvider = needsApiKey
    ? selectedProvider
    : ENGINE_PROVIDER[selectedEngine] ?? 'anthropic';

  const currentIdx = visibleSteps.indexOf(step);

  const goNext = useCallback(() => {
    if (step === 'review') return; // handled by save
    const idx = visibleSteps.indexOf(step);
    if (idx < visibleSteps.length - 1) {
      setStep(visibleSteps[idx + 1]!);
    }
  }, [step, visibleSteps]);

  const goBack = useCallback(() => {
    const idx = visibleSteps.indexOf(step);
    if (idx > 0) {
      setStep(visibleSteps[idx - 1]!);
    }
  }, [step, visibleSteps]);

  // When engine selection changes, decide if we need API key step + reset model
  useEffect(() => {
    if (selectedEngine === 'api-key') {
      setUseApiKey(true);
    } else {
      setUseApiKey(false);
    }
    setSelectedModel(''); // reset model when engine changes
  }, [selectedEngine]);

  // Auto-select first available model when models load for the active provider.
  // Must live in an effect, not in render — calling setState from render causes
  // an infinite re-render loop.
  useEffect(() => {
    if (selectedModel) return;
    const models = (engines.data?.models ?? []).filter(m => m.provider === effectiveProvider);
    if (models.length > 0) {
      setSelectedModel(models[0]!.id);
    }
  }, [engines.data, effectiveProvider, selectedModel]);

  // Channel config helper — get channels that need fields
  const channelsNeedingConfig = Array.from(selectedChannels)
    .map(id => engines.data?.channels.find(c => c.id === id))
    .filter((c): c is ChannelDef => !!c && c.fields.length > 0);

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const engine = selectedEngine === 'api-key' ? 'api' : selectedEngine;
      const channels: Record<string, Record<string, unknown>> = {};
      for (const id of selectedChannels) {
        channels[id] = channelConfigs[id] ?? {};
      }

      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          provider: needsApiKey ? selectedProvider : effectiveProvider,
          apiKey: needsApiKey ? apiKey : undefined,
          model: selectedModel || undefined,
          autonomy: selectedAutonomy,
          channels,
          features: {
            search: features.has('search') ? { enabled: true } : undefined,
            voice: features.has('voice') ? { enabled: true } : undefined,
            mcp: features.has('mcp') ? { enabled: true } : undefined,
            cron: features.has('cron') ? { enabled: true } : undefined,
          },
        }),
      });

      if (!res.ok) {
        let msg = `Server returned ${res.status}`;
        try {
          const errBody = await res.json() as { error?: string };
          if (errBody.error) msg = errBody.error;
        } catch { /* keep default */ }
        console.error('[onboard] save failed:', msg);
        setSaveError(msg);
        return;
      }

      const data = await res.json() as OnboardResponse;
      setResult(data);
      setStep('complete');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reach the GUI server';
      console.error('[onboard] save error:', err);
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (engines.loading) {
    return <div className="onboard"><p style={{ color: 'var(--text-muted)' }}>Detecting engines...</p></div>;
  }

  // ---------------------------------------------------------------------------
  // Progress indicator
  // ---------------------------------------------------------------------------

  const renderProgress = () => (
    <div className="onboard-progress">
      {visibleSteps.map((s, i) => {
        const isCurrent = s === step;
        const isCompleted = visibleSteps.indexOf(step) > i;
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < visibleSteps.length - 1 ? 1 : undefined }}>
            <div className={`onboard-step-dot ${isCurrent ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              {isCompleted ? '✓' : i + 1}
            </div>
            {i < visibleSteps.length - 1 && (
              <div className={`onboard-step-line ${isCompleted ? 'completed' : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Step: Welcome
  // ---------------------------------------------------------------------------

  const renderWelcome = () => (
    <div className="onboard-welcome">
      <div className="onboard-mascot">◈</div>
      <h2>Welcome to ch4p</h2>
      <p>
        Let's set up your AI assistant runtime.<br />
        This wizard will walk you through engine selection, channel configuration, and security settings.
      </p>
      <Button variant="primary" onClick={goNext}>Get Started</Button>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Step: Engine
  // ---------------------------------------------------------------------------

  const renderEngine = () => {
    const availableEngines = engines.data?.engines ?? [];
    const detectedCount = availableEngines.filter(e => e.detected).length;
    const options = [
      ...availableEngines,
      { id: 'api-key', label: 'API Key', description: 'Use an Anthropic or OpenAI API key directly', detected: true },
    ];

    return (
      <div>
        <h3 className="onboard-title">Select Engine</h3>
        <p className="onboard-subtitle">
          {detectedCount > 0
            ? `We detected ${detectedCount} engine${detectedCount > 1 ? 's' : ''} on your system. Others can be installed.`
            : 'No CLI engines detected. Install one or use an API key.'}
        </p>
        <div className="onboard-options">
          {options.map(opt => (
            <div
              key={opt.id}
              className={`onboard-option ${selectedEngine === opt.id ? 'selected' : ''} ${opt.detected === false ? 'not-detected' : ''}`}
              onClick={() => setSelectedEngine(opt.id)}
            >
              <div className="onboard-option-radio" />
              <div className="onboard-option-info">
                <h4>
                  {opt.label}
                  {opt.detected === false && <span className="onboard-badge-install">install required</span>}
                </h4>
                <p>{opt.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Step: Provider (API key path only)
  // ---------------------------------------------------------------------------

  const renderProvider = () => (
    <div>
      <h3 className="onboard-title">Select Provider</h3>
      <p className="onboard-subtitle">Choose the AI provider you'd like to use.</p>
      <div className="onboard-options">
        <div
          className={`onboard-option ${selectedProvider === 'anthropic' ? 'selected' : ''}`}
          onClick={() => { setSelectedProvider('anthropic'); setSelectedModel(''); }}
        >
          <div className="onboard-option-radio" />
          <div className="onboard-option-info">
            <h4>Anthropic</h4>
            <p>Claude 4.6 — Sonnet, Opus, Haiku</p>
          </div>
        </div>
        <div
          className={`onboard-option ${selectedProvider === 'openai' ? 'selected' : ''}`}
          onClick={() => { setSelectedProvider('openai'); setSelectedModel(''); }}
        >
          <div className="onboard-option-radio" />
          <div className="onboard-option-info">
            <h4>OpenAI</h4>
            <p>GPT-4.1, o3, o4-mini models</p>
          </div>
        </div>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Step: API Key
  // ---------------------------------------------------------------------------

  const renderApiKey = () => (
    <div>
      <h3 className="onboard-title">API Key</h3>
      <p className="onboard-subtitle">Enter your {selectedProvider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key. It will be stored in your local config file.</p>
      <div className="onboard-fields">
        <div className="onboard-field">
          <label>{selectedProvider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={selectedProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Step: Model
  // ---------------------------------------------------------------------------

  const renderModel = () => {
    const models = (engines.data?.models ?? []).filter(m => m.provider === effectiveProvider);

    const providerLabel = effectiveProvider === 'anthropic' ? 'Anthropic'
      : effectiveProvider === 'openai' ? 'OpenAI'
      : effectiveProvider === 'ollama' ? 'Ollama'
      : effectiveProvider;

    return (
      <div>
        <h3 className="onboard-title">Select Model</h3>
        <p className="onboard-subtitle">
          Choose the default {providerLabel} model for your agent.
        </p>
        <div className="onboard-options">
          {models.map(m => (
            <div
              key={m.id}
              className={`onboard-option ${selectedModel === m.id ? 'selected' : ''}`}
              onClick={() => setSelectedModel(m.id)}
            >
              <div className="onboard-option-radio" />
              <div className="onboard-option-info">
                <h4>{m.label}</h4>
                <p>{m.id}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Step: Autonomy
  // ---------------------------------------------------------------------------

  const renderAutonomy = () => {
    const levels = engines.data?.autonomyLevels ?? [];
    return (
      <div>
        <h3 className="onboard-title">Autonomy Level</h3>
        <p className="onboard-subtitle">How much independence should your agent have?</p>
        <div className="onboard-options">
          {levels.map(l => (
            <div
              key={l.id}
              className={`onboard-option ${selectedAutonomy === l.id ? 'selected' : ''}`}
              onClick={() => setSelectedAutonomy(l.id)}
            >
              <div className="onboard-option-radio" />
              <div className="onboard-option-info">
                <h4>{l.label}</h4>
                <p>{l.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Step: Channels
  // ---------------------------------------------------------------------------

  const renderChannels = () => {
    const allChannels = engines.data?.channels ?? [];
    const toggleChannel = (id: string) => {
      setSelectedChannels(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    };

    return (
      <div>
        <h3 className="onboard-title">Channels</h3>
        <p className="onboard-subtitle">Select messaging channels for ch4p to connect to.</p>
        <div className="onboard-checkbox-grid">
          {allChannels.map(ch => (
            <div
              key={ch.id}
              className={`onboard-checkbox ${selectedChannels.has(ch.id) ? 'checked' : ''}`}
              onClick={() => toggleChannel(ch.id)}
            >
              <div className="onboard-check-box">✓</div>
              <div>
                <div className="onboard-checkbox-label">{ch.label}</div>
                {ch.notes && <div className="onboard-checkbox-note">{ch.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Step: Channel Config
  // ---------------------------------------------------------------------------

  const renderChannelConfig = () => {
    if (channelsNeedingConfig.length === 0) return null;

    const ch = channelsNeedingConfig[configChannelIdx];
    if (!ch) return null;

    const config = channelConfigs[ch.id] ?? {};

    const updateField = (key: string, value: string) => {
      setChannelConfigs(prev => ({
        ...prev,
        [ch.id]: { ...prev[ch.id], [key]: value },
      }));
    };

    const isLast = configChannelIdx >= channelsNeedingConfig.length - 1;

    return (
      <div>
        <h3 className="onboard-title">Configure {ch.label}</h3>
        <p className="onboard-subtitle">
          Channel {configChannelIdx + 1} of {channelsNeedingConfig.length}
        </p>
        {ch.notes && <p className="onboard-channel-note">{ch.notes}</p>}
        <div className="onboard-fields">
          {ch.fields.map(f => (
            <div key={f.key} className="onboard-field">
              <label>{f.label}</label>
              <input
                type={f.secret ? 'password' : 'text'}
                value={config[f.key] ?? f.defaultValue ?? ''}
                onChange={e => updateField(f.key, e.target.value)}
                placeholder={f.defaultValue ?? ''}
                autoComplete="off"
              />
            </div>
          ))}
        </div>
        <div className="onboard-nav">
          <Button
            variant="secondary"
            onClick={() => {
              if (configChannelIdx > 0) setConfigChannelIdx(i => i - 1);
              else goBack();
            }}
          >
            Back
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (isLast) {
                setConfigChannelIdx(0);
                goNext();
              } else {
                setConfigChannelIdx(i => i + 1);
              }
            }}
          >
            {isLast ? 'Next' : `Next Channel`}
          </Button>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Step: Features
  // ---------------------------------------------------------------------------

  const renderFeatures = () => {
    const featureList = [
      { id: 'search', label: 'Web Search', description: 'Brave Search API' },
      { id: 'voice', label: 'Voice Pipeline', description: 'STT/TTS' },
      { id: 'mcp', label: 'MCP Servers', description: 'Model Context Protocol' },
      { id: 'cron', label: 'Cron & Webhooks', description: 'Scheduled tasks' },
      { id: 'x402', label: 'x402 Micropayments', description: 'HTTP payments on Base/USDC' },
      { id: 'mesh', label: 'Mesh Orchestration', description: 'Multi-agent coordination' },
    ];

    const toggle = (id: string) => {
      setFeatures(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    };

    return (
      <div>
        <h3 className="onboard-title">Additional Features</h3>
        <p className="onboard-subtitle">Enable optional capabilities. These can be configured later in Settings.</p>
        <div className="onboard-checkbox-grid">
          {featureList.map(f => (
            <div
              key={f.id}
              className={`onboard-checkbox ${features.has(f.id) ? 'checked' : ''}`}
              onClick={() => toggle(f.id)}
            >
              <div className="onboard-check-box">✓</div>
              <div>
                <div className="onboard-checkbox-label">{f.label}</div>
                <div className="onboard-checkbox-note">{f.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Step: Review
  // ---------------------------------------------------------------------------

  const renderReview = () => {
    const engineLabel = engines.data?.engines.find(e => e.id === selectedEngine)?.label
      ?? (selectedEngine === 'api-key' ? 'API Key' : selectedEngine);
    const modelLabel = engines.data?.models.find(m => m.id === selectedModel)?.label ?? selectedModel;
    const autonomyLabel = engines.data?.autonomyLevels.find(l => l.id === selectedAutonomy)?.label ?? selectedAutonomy;

    return (
      <div>
        <h3 className="onboard-title">Review Configuration</h3>
        <p className="onboard-subtitle">Confirm your settings before saving.</p>
        <div className="onboard-review">
          <div className="onboard-review-section">
            <h4>Agent</h4>
            <div className="onboard-review-row">
              <span className="label">Engine</span>
              <span className="value">{engineLabel}</span>
            </div>
            <div className="onboard-review-row">
              <span className="label">Model</span>
              <span className="value">{modelLabel}</span>
            </div>
            {needsApiKey && (
              <>
                <div className="onboard-review-row">
                  <span className="label">Provider</span>
                  <span className="value">{selectedProvider}</span>
                </div>
                <div className="onboard-review-row">
                  <span className="label">API Key</span>
                  <span className="value">{apiKey ? '••••••••' + apiKey.slice(-4) : 'Not set'}</span>
                </div>
              </>
            )}
            <div className="onboard-review-row">
              <span className="label">Autonomy</span>
              <span className="value">{autonomyLabel}</span>
            </div>
          </div>

          {selectedChannels.size > 0 && (
            <div className="onboard-review-section">
              <h4>Channels</h4>
              {Array.from(selectedChannels).map(id => {
                const ch = engines.data?.channels.find(c => c.id === id);
                return (
                  <div key={id} className="onboard-review-row">
                    <span className="label">{ch?.label ?? id}</span>
                    <span className="value">Enabled</span>
                  </div>
                );
              })}
            </div>
          )}

          {features.size > 0 && (
            <div className="onboard-review-section">
              <h4>Features</h4>
              {Array.from(features).map(id => (
                <div key={id} className="onboard-review-row">
                  <span className="label">{id}</span>
                  <span className="value">Enabled</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Step: Complete
  // ---------------------------------------------------------------------------

  const renderComplete = () => (
    <div className="onboard-complete">
      <div className="success-icon">✓</div>
      <h2>Setup Complete</h2>
      <p>Your ch4p configuration has been saved.</p>
      {result?.configPath && (
        <div className="config-path">{result.configPath}</div>
      )}
      {result?.audit && (
        <div className="onboard-audit-summary">
          <Badge variant={result.audit.summary.pass > 0 ? 'ok' : 'info'}>
            {result.audit.summary.pass} PASS
          </Badge>
          <Badge variant={result.audit.summary.warn > 0 ? 'warn' : 'info'}>
            {result.audit.summary.warn} WARN
          </Badge>
          <Badge variant={result.audit.summary.fail > 0 ? 'fail' : 'info'}>
            {result.audit.summary.fail} FAIL
          </Badge>
        </div>
      )}
      <div style={{ marginTop: '2rem' }}>
        <Button variant="primary" onClick={onComplete}>Go to Dashboard</Button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const stepRenderers: Record<StepId, () => JSX.Element | null> = {
    welcome: renderWelcome,
    engine: renderEngine,
    provider: renderProvider,
    apikey: renderApiKey,
    model: renderModel,
    autonomy: renderAutonomy,
    channels: renderChannels,
    'channel-config': renderChannelConfig,
    features: renderFeatures,
    review: renderReview,
    complete: renderComplete,
  };

  const canGoNext =
    step === 'welcome' ||
    (step === 'engine' && selectedEngine !== '') ||
    step === 'provider' ||
    (step === 'apikey' && apiKey.length > 0) ||
    step === 'model' ||
    step === 'autonomy' ||
    step === 'channels' ||
    step === 'features';

  const showNav = step !== 'welcome' && step !== 'complete' && step !== 'channel-config';

  return (
    <div className="onboard">
      {step !== 'welcome' && step !== 'complete' && renderProgress()}
      {stepRenderers[step]?.()}
      {step === 'review' && saveError && (
        <div
          role="alert"
          style={{
            margin: '16px 0',
            padding: '12px 16px',
            background: 'var(--bg-error, #2a1515)',
            color: 'var(--text-error, #ff6b6b)',
            border: '1px solid var(--border-error, #5a2020)',
            borderRadius: 6,
          }}
        >
          <strong>Save failed:</strong> {saveError}
        </div>
      )}
      {showNav && (
        <div className="onboard-nav">
          {currentIdx > 0 ? (
            <Button variant="secondary" onClick={goBack}>Back</Button>
          ) : (
            <div className="onboard-nav-spacer" />
          )}
          {step === 'review' ? (
            <Button variant="primary" onClick={handleSave} loading={saving}>
              Save Configuration
            </Button>
          ) : (
            <Button variant="primary" onClick={goNext} disabled={!canGoNext}>
              Next
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
