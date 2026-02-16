/**
 * AgentStatusBar — Shows the current agent execution state.
 */

interface AgentStatusBarProps {
  status: string;
  message: string;
}

const STATUS_LABELS: Record<string, string> = {
  idle: '',
  thinking: 'Thinking...',
  streaming: 'Responding...',
  tool_executing: 'Executing tool...',
  complete: 'Done',
  error: 'Error',
};

export function AgentStatusBar({ status, message }: AgentStatusBarProps) {
  if (status === 'idle' || status === 'complete') return null;

  const label = STATUS_LABELS[status] ?? status;

  return (
    <div className={`agent-status-bar status-${status}`}>
      <div className="status-indicator" />
      <span className="status-label">{label}</span>
      {message && <span className="status-message">{message}</span>}
    </div>
  );
}
