import { useEffect, useState } from 'react';
import { Bot, X } from 'lucide-react';
import { IconButton, Panel } from '../ui';
import type { CodexStatus, EntityResearchState, InvestigationEntity } from '../../shared/domain';
import { getCodexIndicatorState } from '../lib/codexIndicator';

export function ResearchQueueControl({ codex, research, entities }: { codex: CodexStatus; research: Record<string, EntityResearchState>; entities: InvestigationEntity[] }) {
  const [open, setOpen] = useState(false);
  const tasks = Object.values(research).filter((item, index, all) => all.findIndex((candidate) => candidate.startedAt === item.startedAt) === index).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const running = tasks.filter((task) => task.status === 'running').length;
  const indicator = getCodexIndicatorState(codex, research);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  return <div className="research-queue-control">
    <button className={`research-queue-trigger is-${indicator.tone}`} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={indicator.label} title={indicator.label}><Bot size={14} />{tasks.length > 0 && <span>{running || tasks.length}</span>}</button>
    {open && <Panel className="research-queue-panel" title="Исследования" toolbar={<IconButton icon="error" label="Закрыть очередь исследований" onClick={() => setOpen(false)} />}>
      {tasks.length === 0 ? <p className="muted-copy">Исследования ещё не запускались.</p> : <div className="research-queue-list">{tasks.map((task) => {
        const names = task.entityIds.map((id) => entities.find((entity) => entity.id === id)?.title).filter(Boolean).join(', ');
        return <div className={`research-queue-item is-${task.status}`} key={task.startedAt}><span>{task.status === 'running' ? <Bot size={12} /> : task.status === 'error' ? <X size={12} /> : '✓'}</span><div><strong>{task.mode === 'relationships' ? 'Поиск связи' : 'Поиск информации'}</strong><small title={names}>{names}</small><p>{task.message}</p></div></div>;
      })}</div>}
    </Panel>}
  </div>;
}
