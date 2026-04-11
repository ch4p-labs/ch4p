import './components.css';

interface BadgeProps {
  variant: 'ok' | 'warn' | 'fail' | 'pass' | 'info';
  children?: React.ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  const label = children ?? variant.toUpperCase();
  return <span className={`badge badge-${variant}`}>{label}</span>;
}
