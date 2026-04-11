import { useApi } from '../hooks/useApi';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import './Channels.css';

interface ChannelInfo {
  id: string;
  enabled: boolean;
  hasCredentials: boolean;
}

const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  matrix: 'Matrix',
  teams: 'Microsoft Teams',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  imessage: 'iMessage',
  irc: 'IRC',
  'zalo-oa': 'Zalo OA',
  'zalo-personal': 'Zalo Personal',
  bluebubbles: 'BlueBubbles',
  'google-chat': 'Google Chat',
  webchat: 'WebChat',
  macos: 'macOS Native',
};

const CHANNEL_ICONS: Record<string, string> = {
  telegram: '✈',
  discord: '⬡',
  slack: '#',
  matrix: '▣',
  teams: '◈',
  whatsapp: '◉',
  signal: '◆',
  imessage: '◎',
  irc: '>_',
  'zalo-oa': 'Z',
  'zalo-personal': 'Z',
  bluebubbles: '●',
  'google-chat': 'G',
  webchat: '◇',
  macos: '⌘',
};

export function Channels() {
  const data = useApi<{ channels: ChannelInfo[] }>('/api/channels');

  if (data.loading) return <div className="channels-page"><p className="loading-text">Loading channels...</p></div>;
  if (data.error) return <div className="channels-page"><p className="error-text">{data.error}</p></div>;

  const channels = data.data?.channels ?? [];
  const enabled = channels.filter(c => c.enabled);
  const disabled = channels.filter(c => !c.enabled);

  return (
    <div className="channels-page">
      <div className="settings-header">
        <div>
          <h1 className="page-title">Channels</h1>
          <p className="page-subtitle">{channels.length} channel{channels.length !== 1 ? 's' : ''} configured</p>
        </div>
        <Button variant="secondary" size="sm" onClick={data.refetch}>Refresh</Button>
      </div>

      {channels.length === 0 && (
        <div className="channels-empty">
          <p>No channels configured yet.</p>
          <p className="channels-empty-hint">
            Use the <strong>Setup Wizard</strong> or edit <code>~/.ch4p/config.json</code> to add channels.
          </p>
        </div>
      )}

      {enabled.length > 0 && (
        <>
          <h2 className="section-title">Active Channels</h2>
          <div className="channels-grid">
            {enabled.map(ch => (
              <div key={ch.id} className="channel-card active">
                <div className="channel-card-icon">{CHANNEL_ICONS[ch.id] ?? '◇'}</div>
                <div className="channel-card-info">
                  <h3>{CHANNEL_LABELS[ch.id] ?? ch.id}</h3>
                  <div className="channel-card-status">
                    <Badge variant={ch.hasCredentials ? 'ok' : 'warn'}>
                      {ch.hasCredentials ? 'Configured' : 'Missing credentials'}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {disabled.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: '2rem' }}>Disabled Channels</h2>
          <div className="channels-grid">
            {disabled.map(ch => (
              <div key={ch.id} className="channel-card disabled">
                <div className="channel-card-icon">{CHANNEL_ICONS[ch.id] ?? '◇'}</div>
                <div className="channel-card-info">
                  <h3>{CHANNEL_LABELS[ch.id] ?? ch.id}</h3>
                  <Badge variant="info">Disabled</Badge>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
