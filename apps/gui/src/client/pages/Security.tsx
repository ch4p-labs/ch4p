import { useApi } from '../hooks/useApi';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import type { AuditResponse } from '../../shared/types';
import './Security.css';

const SEVERITY_ICON: Record<string, string> = {
  pass: '✓',
  warn: '!',
  fail: '✕',
};

export function Security() {
  const audit = useApi<AuditResponse>('/api/audit');

  if (audit.initialLoading) return <div className="security"><p className="loading-text">Running security audit...</p></div>;
  if (audit.error && !audit.data) return <div className="security"><p className="error-text">{audit.error}</p></div>;
  if (!audit.data) return null;

  const { results, summary } = audit.data;

  return (
    <div className="security">
      <div className="settings-header">
        <div>
          <h1 className="page-title">Security Audit</h1>
          <p className="page-subtitle">10-point security posture assessment</p>
        </div>
        <Button variant="secondary" size="sm" onClick={audit.refetch} loading={audit.refreshing}>
          Re-run Audit
        </Button>
      </div>

      {/* Summary bar */}
      <div className="audit-summary-bar">
        <div className="audit-summary-item pass">
          <span className="audit-summary-count">{summary.pass}</span>
          <span className="audit-summary-label">PASS</span>
        </div>
        <div className="audit-summary-item warn">
          <span className="audit-summary-count">{summary.warn}</span>
          <span className="audit-summary-label">WARN</span>
        </div>
        <div className="audit-summary-item fail">
          <span className="audit-summary-count">{summary.fail}</span>
          <span className="audit-summary-label">FAIL</span>
        </div>
        <div className="audit-summary-item total">
          <span className="audit-summary-count">{summary.total}</span>
          <span className="audit-summary-label">TOTAL</span>
        </div>
      </div>

      {/* Audit cards */}
      <div className="audit-cards">
        {results.map(item => (
          <div key={item.id} className={`audit-card ${item.severity}`}>
            <div className="audit-card-header">
              <div className="audit-card-icon">
                <span className={`audit-icon ${item.severity}`}>
                  {SEVERITY_ICON[item.severity]}
                </span>
              </div>
              <div className="audit-card-title">
                <h3>{item.name}</h3>
                <Badge variant={item.severity === 'pass' ? 'ok' : item.severity === 'warn' ? 'warn' : 'fail'}>
                  {item.severity.toUpperCase()}
                </Badge>
              </div>
            </div>
            <p className="audit-card-message">{item.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
