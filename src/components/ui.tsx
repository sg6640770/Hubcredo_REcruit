import type { ReactNode } from 'react';

export function LoadingSpinner({ size = 24 }: { size?: number }) {
  return (
    <div className="jp-spinner" style={{ width: size, height: size }} aria-label="Loading" />
  );
}

export function LoadingSkeleton({ className = '' }: { className?: string }) {
  return <div className={`jp-skeleton ${className}`} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="jp-empty-state">
      {icon && <div className="jp-empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="jp-empty-action">{action}</div>}
    </div>
  );
}

export function Badge({
  children,
  variant = 'neutral',
}: {
  children: ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'primary';
}) {
  return <span className={`jp-badge jp-badge-${variant}`}>{children}</span>;
}

export function Modal({
  open,
  onClose,
  children,
  title,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;
  return (
    <div className="jp-modal-backdrop" onClick={onClose}>
      <div className={`jp-modal jp-modal-${size}`} onClick={(e) => e.stopPropagation()}>
        <div className="jp-modal-header">
          {title && <h2>{title}</h2>}
          <button className="jp-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="jp-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function TagInput({
  values,
  onChange,
  placeholder = 'Type and press Enter',
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const add = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
  };
  const remove = (val: string) => onChange(values.filter((v) => v !== val));
  return (
    <div className="jp-tag-input">
      {values.map((v) => (
        <span key={v} className="jp-tag">
          {v}
          <button onClick={() => remove(v)} aria-label={`Remove ${v}`}>
            ✕
          </button>
        </span>
      ))}
      <input
        type="text"
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = '';
          }
        }}
        onBlur={(e) => {
          if (e.target.value) {
            add(e.target.value);
            e.target.value = '';
          }
        }}
      />
    </div>
  );
}
