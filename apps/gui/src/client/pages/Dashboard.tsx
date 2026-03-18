import { useApi } from '../hooks/useApi';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import type { StatusResponse, DoctorResponse } from '../../shared/types';
import './Dashboard.css';

export function Dashboard() {
  const status = useApi<StatusResponse>('/api/status');
  const doctor = useApi<DoctorResponse>('/api/doctor');

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">System status and health checks</p>
      </div>

      {/* Status section */}
      <section className="dashboard-section animate-fade-up">
        <h2 className="section-title">System Status</h2>

        {status.initialLoading && <div className="loading-text">Loading status...</div>}
        {status.error && !status.data && <div className="error-text">{status.error}</div>}

        {status.data && (
          <div className="status-grid">
            <Card title="System">
              <StatusRow label="Version" value={`v${status.data.version}`} />
              <StatusRow label="Config" value={status.data.configExists ? 'Loaded' : 'Not found'} accent={status.data.configExists} />
              <StatusRow label="Data dir" value={status.data.dataDir} mono />
            </Card>

            <Card title="Agent">
              <StatusRow label="Provider" value={status.data.provider || '—'} />
              <StatusRow label="Model" value={status.data.model || '—'} mono />
              <StatusRow label="Engine" value={status.data.engine || '—'} />
            </Card>

            <Card title="Autonomy">
              <div className="autonomy-display">
                <Badge status={
                  status.data.autonomy === 'readonly' ? 'ok' :
                  status.data.autonomy === 'supervised' ? 'warn' : 'fail'
                }>
                  {status.data.autonomy || '—'}
                </Badge>
              </div>
            </Card>

            <Card title="Gateway">
              <StatusRow label="Port" value={String(status.data.gateway.port)} mono />
              <StatusRow label="Pairing" value={status.data.gateway.requirePairing ? 'Required' : 'Disabled'}
                accent={status.data.gateway.requirePairing} />
            </Card>

            <Card title="Memory">
              <StatusRow label="Backend" value={status.data.memory.backend} />
              <StatusRow label="Auto-save" value={status.data.memory.autoSave ? 'On' : 'Off'}
                accent={status.data.memory.autoSave} />
            </Card>

            <Card title="Channels">
              {status.data.channels.length > 0 ? (
                <div className="channel-tags">
                  {status.data.channels.map((ch) => (
                    <span key={ch} className="channel-tag">{ch}</span>
                  ))}
                </div>
              ) : (
                <span className="text-muted">None configured</span>
              )}
            </Card>

            <Card title="Security">
              <StatusRow label="Secrets" value={status.data.secretsEncrypted ? 'Encrypted' : 'Plaintext'}
                accent={status.data.secretsEncrypted} />
              <StatusRow label="Tunnel" value={status.data.tunnel === 'none' ? 'Disabled' : status.data.tunnel} />
            </Card>

            <Card title="API Keys">
              <StatusRow label="Anthropic" value={status.data.apiKeys.anthropic ? 'Configured' : 'Missing'}
                accent={status.data.apiKeys.anthropic} />
              <StatusRow label="OpenAI" value={status.data.apiKeys.openai ? 'Configured' : 'Missing'}
                accent={status.data.apiKeys.openai} />
            </Card>
          </div>
        )}
      </section>

      {/* Doctor section */}
      <section className="dashboard-section animate-fade-up" style={{ animationDelay: '0.1s' }}>
        <div className="section-header">
          <h2 className="section-title">Health Checks</h2>
          <Button variant="secondary" size="sm" onClick={doctor.refetch} loading={doctor.refreshing}>
            Re-run
          </Button>
        </div>

        {doctor.initialLoading && <div className="loading-text">Running checks...</div>}
        {doctor.error && !doctor.data && <div className="error-text">{doctor.error}</div>}

        {doctor.data && (
          <>
            <div className="doctor-checks">
              {doctor.data.checks.map((check, i) => (
                <div key={i} className="doctor-check-row">
                  <Badge status={check.status}>{check.status}</Badge>
                  <span className="doctor-check-name">{check.name}</span>
                  <span className="doctor-check-message">{check.message}</span>
                </div>
              ))}
            </div>

            <div className="doctor-summary">
              <Badge status="ok">{doctor.data.summary.ok} OK</Badge>
              <Badge status="warn">{doctor.data.summary.warn} WARN</Badge>
              <Badge status="fail">{doctor.data.summary.fail} FAIL</Badge>
              <span className="text-muted">({doctor.data.summary.total} checks)</span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function StatusRow({ label, value, mono, accent }: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="status-row">
      <span className="status-label">{label}</span>
      <span className={`status-value ${mono ? 'mono' : ''} ${accent ? 'accent' : ''}`}>{value}</span>
    </div>
  );
}
