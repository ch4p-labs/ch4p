import './components.css';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  onClick,
  children,
}: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && <span className="btn-spinner" />}
      {children}
    </button>
  );
}
