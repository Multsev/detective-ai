import { useEffect, useState } from 'react';
import { IconButton, Panel } from '@operator-ui/framework';
import { evidenceStatuses } from '../../shared/domain';
import { evidenceStyles } from '../../shared/evidenceStyle';

export function EvidenceLegendControl() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <div className="evidence-legend-control">
      {open && (
        <Panel
          className="evidence-legend-panel"
          title="Легенда связей"
          toolbar={<IconButton icon="error" label="Скрыть легенду" onClick={() => setOpen(false)} />}
        >
          <div className="evidence-legend-list">
            {evidenceStatuses.map((status) => {
              const visual = evidenceStyles[status];
              return (
                <div key={status}>
                  <svg viewBox="0 0 34 8" aria-hidden="true">
                    <line x1="1" y1="4" x2="33" y2="4" stroke={visual.color} strokeWidth={visual.width} strokeDasharray={visual.dash} />
                  </svg>
                  <span>{visual.label}</span>
                </div>
              );
            })}
          </div>
          <p>Гипотеза не считается фактом без проверки источниками.</p>
        </Panel>
      )}
      <IconButton
        icon="info"
        label={open ? 'Скрыть легенду связей' : 'Показать легенду связей'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      />
    </div>
  );
}
