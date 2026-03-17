import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../components/Button';
import './Terminal.css';

interface LogEntry {
  source: 'stdout' | 'stderr';
  file: string;
  lines: string[];
  size: number;
  modified: string;
}

interface LogsResponse {
  logsDir: string;
  entries: LogEntry[];
  available: string[];
}

type LogFilter = 'all' | 'stdout' | 'stderr';

export function Terminal() {
  const [logs, setLogs] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<LogFilter>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [lines, setLines] = useState(200);
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs?lines=${lines}`);
      const data = await res.json() as LogsResponse;
      setLogs(data);
      setError('');
    } catch {
      setError('Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [lines]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  if (loading) return <div className="terminal-page"><p className="loading-text">Loading logs...</p></div>;
  if (error) return <div className="terminal-page"><p className="error-text">{error}</p></div>;

  const filteredEntries = (logs?.entries ?? []).filter(
    e => filter === 'all' || e.source === filter,
  );

  // Merge and interleave lines with source labels
  const allLines: { text: string; source: 'stdout' | 'stderr' }[] = [];
  for (const entry of filteredEntries) {
    for (const line of entry.lines) {
      allLines.push({ text: line, source: entry.source });
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <div>
          <h1 className="page-title">Terminal</h1>
          <p className="page-subtitle">
            Gateway logs from <code>{logs?.logsDir}</code>
          </p>
        </div>
        <div className="terminal-controls">
          <div className="terminal-filter">
            {(['all', 'stdout', 'stderr'] as const).map(f => (
              <button
                key={f}
                className={`terminal-filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            className={`terminal-auto-scroll ${autoScroll ? 'active' : ''}`}
            onClick={() => setAutoScroll(!autoScroll)}
            title="Auto-scroll to bottom"
          >
            ↓
          </button>
          <Button variant="secondary" size="sm" onClick={fetchLogs}>Refresh</Button>
        </div>
      </div>

      {/* Log file info */}
      {logs && logs.entries.length > 0 && (
        <div className="terminal-file-info">
          {logs.entries.map(e => (
            <div key={e.file} className="terminal-file-badge">
              <span className={`terminal-source-dot ${e.source}`} />
              <span className="terminal-file-name">{e.file}</span>
              <span className="terminal-file-size">{formatSize(e.size)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Log output */}
      <div className="terminal-output">
        {allLines.length === 0 ? (
          <div className="terminal-empty">
            <p>No log entries found.</p>
            <p className="terminal-empty-hint">
              Start the gateway with <code>ch4p gateway</code> to generate logs.
            </p>
          </div>
        ) : (
          <pre className="terminal-pre">
            {allLines.map((line, i) => (
              <div key={i} className={`terminal-line ${line.source}`}>
                <span className="terminal-line-num">{i + 1}</span>
                <span className="terminal-line-text">{line.text}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </pre>
        )}
      </div>

      {/* Footer */}
      <div className="terminal-footer">
        <span className="terminal-line-count">{allLines.length} lines</span>
        <div className="terminal-lines-select">
          <span>Show:</span>
          <select
            value={lines}
            onChange={e => setLines(Number(e.target.value))}
            className="setting-select"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        </div>
      </div>
    </div>
  );
}
