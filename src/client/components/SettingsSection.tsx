import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface SettingsSectionProps {
  title: string;
  description: string;
  icon: ReactNode;
  status?: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({ title, description, icon, status, open, onToggle, children, className = '' }: SettingsSectionProps) {
  return <details className={`settings-section ${className}`} open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
    <summary>
      <span className="settings-section__icon">{icon}</span>
      <span className="settings-section__label"><strong>{title}</strong><small>{description}</small></span>
      {status && <span className="settings-section__status">{status}</span>}
      <ChevronRight className="settings-section__chevron" size={14} aria-hidden="true" />
    </summary>
    <div className="settings-section__content">{children}</div>
  </details>;
}
