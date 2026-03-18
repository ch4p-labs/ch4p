import { useState, useRef, useEffect } from 'react';
import './components.css';

interface SelectProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Custom themed <select> replacement.
 * Renders a button trigger + absolute-positioned dropdown panel.
 * Fully styled to match the ch4p dark/light theme.
 */
export function Select({ value, options, onChange, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div className={`custom-select ${className ?? ''}`} ref={ref}>
      <button
        className={`custom-select-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="custom-select-value">{selected?.label ?? value}</span>
        <span className={`custom-select-arrow ${open ? 'open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="custom-select-dropdown">
          {options.map(o => (
            <button
              key={o.value}
              className={`custom-select-option ${o.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              type="button"
            >
              {o.value === value && <span className="custom-select-check">✓</span>}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
