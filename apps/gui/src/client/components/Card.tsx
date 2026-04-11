import './components.css';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, children, className }: CardProps) {
  return (
    <div className={`card ${className ?? ''}`}>
      {title && <h3 className="card-title">{title}</h3>}
      <div className="card-body">{children}</div>
    </div>
  );
}
