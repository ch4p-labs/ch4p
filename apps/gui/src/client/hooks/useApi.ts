import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True only on the very first load (no existing data). */
  initialLoading: boolean;
  /** True when refetching (data already exists, refreshing in background). */
  refreshing: boolean;
  refetch: () => void;
}

export function useApi<T>(url: string): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState(0);
  const hasData = useRef(false);

  const refetch = useCallback(() => setTrigger((t) => t + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status}: ${body}`);
        }
        return res.json() as Promise<T>;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          hasData.current = true;
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        // Aborted requests are expected during cleanup/refetch — silently ignore.
        if (cancelled || (err instanceof Error && err.name === 'AbortError')) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, trigger]);

  return {
    data,
    error,
    loading,
    initialLoading: loading && !hasData.current,
    refreshing: loading && hasData.current,
    refetch,
  };
}
