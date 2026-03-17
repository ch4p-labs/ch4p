import './components.css';

interface BadgeProps {
  status: 'ok' | 'warn' | 'fail' | 'pass' | 'info';
  children?: React.ReactNode;
}

export function Badge({ status, children }: BadgeProps) {
  const label = children ?? status.toUpperCase();
  return <span className={`badge badge-${status}`}>{label}</span>;
}
