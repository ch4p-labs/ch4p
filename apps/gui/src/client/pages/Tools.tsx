import { useApi } from '../hooks/useApi';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import './Tools.css';

interface ToolInfo {
  name: string;
  type: 'builtin' | 'skill' | 'mcp';
  enabled: boolean;
  description?: string;
}

interface ToolsResponse {
  tools: ToolInfo[];
  skillsEnabled: boolean;
  skillPaths: string[];
  mcpServers: string[];
}

const TYPE_LABELS: Record<string, string> = {
  builtin: 'Built-in',
  skill: 'Skill',
  mcp: 'MCP',
};

const TYPE_COLORS: Record<string, 'ok' | 'info' | 'pass'> = {
  builtin: 'info',
  skill: 'ok',
  mcp: 'pass',
};

export function Tools() {
  const data = useApi<ToolsResponse>('/api/tools');

  if (data.loading) return <div className="tools-page"><p className="loading-text">Loading tools...</p></div>;
  if (data.error) return <div className="tools-page"><p className="error-text">{data.error}</p></div>;
  if (!data.data) return null;

  const { tools, skillsEnabled, skillPaths, mcpServers } = data.data;
  const builtins = tools.filter(t => t.type === 'builtin');
  const skills = tools.filter(t => t.type === 'skill');
  const mcpTools = tools.filter(t => t.type === 'mcp');

  return (
    <div className="tools-page">
      <div className="settings-header">
        <div>
          <h1 className="page-title">Tools & Skills</h1>
          <p className="page-subtitle">{tools.length} tool{tools.length !== 1 ? 's' : ''} available</p>
        </div>
        <Button variant="secondary" size="sm" onClick={data.refetch}>Refresh</Button>
      </div>

      {/* Summary cards */}
      <div className="tools-summary">
        <Card title="Skills">
          <div className="setting-row">
            <span className="setting-label">Status</span>
            <Badge variant={skillsEnabled ? 'ok' : 'warn'}>
              {skillsEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <div className="setting-row">
            <span className="setting-label">Loaded</span>
            <span className="tools-count">{skills.length}</span>
          </div>
          {skillPaths.length > 0 && (
            <div className="tools-paths">
              {skillPaths.map(p => (
                <code key={p} className="tools-path">{p}</code>
              ))}
            </div>
          )}
        </Card>

        <Card title="MCP Servers">
          <div className="setting-row">
            <span className="setting-label">Connected</span>
            <span className="tools-count">{mcpServers.length}</span>
          </div>
          {mcpServers.length > 0 ? (
            <div className="tools-paths">
              {mcpServers.map(s => (
                <code key={s} className="tools-path">{s}</code>
              ))}
            </div>
          ) : (
            <p className="tools-none">No MCP servers configured</p>
          )}
        </Card>
      </div>

      {/* Built-in tools */}
      <h2 className="section-title">Built-in Tools</h2>
      <div className="tools-grid">
        {builtins.map(t => (
          <div key={t.name} className="tool-item">
            <div className="tool-item-header">
              <code className="tool-name">{t.name}</code>
              <Badge variant={TYPE_COLORS[t.type]}>{TYPE_LABELS[t.type]}</Badge>
            </div>
            {t.description && <p className="tool-desc">{t.description}</p>}
          </div>
        ))}
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: '2rem' }}>Skills</h2>
          <div className="tools-grid">
            {skills.map(t => (
              <div key={t.name} className="tool-item">
                <div className="tool-item-header">
                  <code className="tool-name">{t.name}</code>
                  <Badge variant="ok">Skill</Badge>
                </div>
                {t.description && <p className="tool-desc">{t.description}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* MCP tools */}
      {mcpTools.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: '2rem' }}>MCP Tools</h2>
          <div className="tools-grid">
            {mcpTools.map(t => (
              <div key={t.name} className="tool-item">
                <div className="tool-item-header">
                  <code className="tool-name">{t.name}</code>
                  <Badge variant="pass">MCP</Badge>
                </div>
                {t.description && <p className="tool-desc">{t.description}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
