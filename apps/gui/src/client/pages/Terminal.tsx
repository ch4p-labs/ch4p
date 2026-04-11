import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import './Terminal.css';

interface LiveLine {
  text: string;
  source: 'stdout' | 'stderr';
  ts: number;
}

interface GatewayOutputResponse {
  lines: LiveLine[];
  total: number;
}

type LogFilter = 'all' | 'stdout' | 'stderr';

/** Strip ANSI escape codes for display. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[\d*(;\d+)*m/g, '');
}

export function Terminal() {
  const [output, setOutput] = useState<GatewayOutputResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<LogFilter>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [lines, setLines] = useState(200);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Refs hold latest filter/lines so the polling interval doesn't need to be
  // torn down and re-created every time the user toggles the filter — that
  // recreation pattern can briefly stack intervals during rapid changes.
  const filterRef = useRef(filter);
  const linesRef = useRef(lines);
  useEffect(() => { filterRef.current = filter; }, [filter]);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  const fetchOutput = useCallback(async () => {
    try {
      const res = await fetch(`/api/gateway-output?lines=${linesRef.current}&filter=${filterRef.current}`);
      const data = await res.json() as GatewayOutputResponse;
      setOutput(data);
      setError('');
    } catch {
      setError('Failed to fetch gateway output');
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 2 seconds for live output. Interval is created once and reads
  // the current filter/lines from refs on each tick.
  useEffect(() => {
    fetchOutput();
    const interval = setInterval(fetchOutput, 2000);
    return () => clearInterval(interval);
  }, [fetchOutput]);

  // Refetch immediately when filter or lines changes so the user sees the
  // change without waiting up to 2 seconds for the next interval tick.
  useEffect(() => {
    fetchOutput();
  }, [filter, lines, fetchOutput]);

  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [output, autoScroll]);

  if (loading && !output) return <div className="terminal-page"><p className="loading-text">Connecting to gateway...</p></div>;
  if (error && !output) return <div className="terminal-page"><p className="error-text">{error}</p></div>;

  const displayLines = output?.lines ?? [];

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <div>
          <h1 className="page-title">Terminal</h1>
          <p className="page-subtitle">
            Live gateway output
            {output && <span className="terminal-total"> ({output.total} lines captured)</span>}
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
          <Button variant="secondary" size="sm" onClick={fetchOutput}>Refresh</Button>
        </div>
      </div>

      {/* Log output */}
      <div className="terminal-output">
        {displayLines.length === 0 ? (
          <div className="terminal-empty">
            <p>No gateway output yet.</p>
            <p className="terminal-empty-hint">
              The gateway starts automatically with the GUI. Output will appear here.
            </p>
          </div>
        ) : (
          <pre className="terminal-pre">
            {displayLines.map((line, i) => (
              <div key={i} className={`terminal-line ${line.source}`}>
                <span className="terminal-line-num">{i + 1}</span>
                <span className="terminal-line-text">{stripAnsi(line.text)}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </pre>
        )}
      </div>

      {/* Footer */}
      <div className="terminal-footer">
        <span className="terminal-line-count">{displayLines.length} lines</span>
        <div className="terminal-lines-select">
          <span>Show:</span>
          <Select
            value={String(lines)}
            options={[
              { value: '50', label: '50' },
              { value: '100', label: '100' },
              { value: '200', label: '200' },
              { value: '500', label: '500' },
              { value: '1000', label: '1000' },
            ]}
            onChange={v => setLines(Number(v))}
          />
        </div>
      </div>
    </div>
  );
}
