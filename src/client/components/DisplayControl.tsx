import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button, Checkbox, IconButton, Panel } from '../ui';
import { entityTypes, evidenceStatuses, type EntityType, type EvidenceStatus, type InvestigationCase } from '../../shared/domain';
import { evidenceStyles } from '../../shared/evidenceStyle';

const layers: Array<{ type: EntityType; label: string }> = [
  { type: 'person', label: 'Люди' },
  { type: 'company', label: 'Компании' },
  { type: 'document', label: 'Документы' },
  { type: 'event', label: 'События' },
  { type: 'location', label: 'Места' },
  { type: 'question', label: 'Вопросы' },
  { type: 'note', label: 'Заметки' },
];

export interface DisplayOpenRequest {
  key: number;
  tab: 'filters' | 'legend';
}

interface DisplayControlProps {
  investigationCase: InvestigationCase;
  visibleTypes: ReadonlySet<EntityType>;
  visibleEvidenceStatuses: ReadonlySet<EvidenceStatus>;
  onlySubjectNetwork: boolean;
  openRequest?: DisplayOpenRequest;
  onToggleType: (type: EntityType) => void;
  onToggleEvidence: (status: EvidenceStatus) => void;
  onOnlySubjectNetworkChange: (enabled: boolean) => void;
  onReset: () => void;
}

export function DisplayControl({ investigationCase, visibleTypes, visibleEvidenceStatuses, onlySubjectNetwork, openRequest, onToggleType, onToggleEvidence, onOnlySubjectNetworkChange, onReset }: DisplayControlProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'filters' | 'legend'>('filters');
  const activeFilterCount = entityTypes.length - visibleTypes.size + evidenceStatuses.length - visibleEvidenceStatuses.size + Number(onlySubjectNetwork);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  useEffect(() => {
    if (!openRequest) return;
    setTab(openRequest.tab);
    setOpen(true);
  }, [openRequest]);
  return <div className="display-control">
    {open && <Panel className="display-control__panel" title="Отображение" toolbar={<IconButton icon="error" label="Закрыть отображение" onClick={() => setOpen(false)} />}>
      <div className="display-control__tabs"><button className={tab === 'filters' ? 'is-active' : ''} onClick={() => setTab('filters')}>Фильтры</button><button className={tab === 'legend' ? 'is-active' : ''} onClick={() => setTab('legend')}>Легенда</button></div>
      {tab === 'filters' ? <>
        <div className="display-filter-section"><strong>Типы объектов</strong>{layers.map(({ type, label }) => <Checkbox key={type} checked={visibleTypes.has(type)} onChange={() => onToggleType(type)} label={`${label} · ${investigationCase.entities.filter((entity) => entity.type === type).length}`} />)}</div>
        <div className="display-filter-section"><strong>Достоверность связей</strong>{evidenceStatuses.map((status) => <Checkbox key={status} checked={visibleEvidenceStatuses.has(status)} onChange={() => onToggleEvidence(status)} label={evidenceStyles[status].label} />)}</div>
        <div className="display-filter-section"><Checkbox checked={onlySubjectNetwork} onChange={(event) => onOnlySubjectNetworkChange(event.target.checked)} label="Только сеть исследуемого объекта" /></div>
        <Button onClick={onReset}>Сбросить фильтры</Button>
      </> : <div className="evidence-legend-list">{evidenceStatuses.map((status) => { const visual = evidenceStyles[status]; return <div key={status}><svg viewBox="0 0 34 8" aria-hidden="true"><line x1="1" y1="4" x2="33" y2="4" stroke={visual.color} strokeWidth={visual.width} strokeDasharray={visual.dash} /></svg><span>{visual.label}</span></div>; })}<p>Гипотеза не считается фактом без проверки источниками.</p></div>}
    </Panel>}
    <button className={`board-tool-button ${open ? 'is-active' : ''}`} aria-label="Отображение, фильтры и легенда" aria-expanded={open} onClick={() => setOpen((current) => !current)} title="Отображение"><SlidersHorizontal size={14} />{activeFilterCount > 0 && <small>{activeFilterCount}</small>}</button>
  </div>;
}
