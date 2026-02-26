/**
 * useSettings — hook for fetching and updating the gateway config via the
 * REST settings API (GET /config · PATCH /config).
 *
 * Authentication uses the bearer token from the `token` query parameter
 * (same as the WebSocket canvas connection).
 */

import { useState, useEffect, useCallback } from 'react';

export interface SafeConfig {
  agent: {
    model: string;
    provider: string;
    thinkingLevel?: 'low' | 'medium' | 'high';
  };
  gateway: { requirePairing: boolean };
  memory: { autoSave: boolean };
  autonomy: { level: 'readonly' | 'supervised' | 'full' };
  observability: { logLevel: 'debug' | 'info' | 'warn' | 'error' };
  skills: { enabled: boolean };
  tunnel: { provider: string };
}

export interface UseSettingsResult {
  config: SafeConfig | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  saveResult: string | null;
  reload: () => void;
  save: (updates: Partial<SafeConfig>) => Promise<void>;
}

function getToken(): string {
  return new URLSearchParams(window.location.search).get('token') ?? '';
}

function getBaseUrl(): string {
  return window.location.origin;
}

export function useSettings(): UseSettingsResult {
  const [config, setConfig] = useState<SafeConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  const reload = useCallback(() => {
    const token = getToken();
    const base = getBaseUrl();
    setLoading(true);
    setError(null);

    fetch(`${base}/config`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SafeConfig>;
      })
      .then((data) => {
        setConfig(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(async (updates: Partial<SafeConfig>): Promise<void> => {
    const token = getToken();
    const base = getBaseUrl();
    setSaving(true);
    setError(null);
    setSaveResult(null);

    try {
      const res = await fetch(`${base}/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveResult('Settings saved. Restart gateway to apply.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, []);

  return { config, loading, saving, error, saveResult, reload, save };
}
