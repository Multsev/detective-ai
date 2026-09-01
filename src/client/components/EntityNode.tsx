import { Building2, CalendarDays, CheckCircle2, CircleHelp, ContactRound, ExternalLink, FileText, LoaderCircle, MapPin, NotebookPen, PenLine, TriangleAlert, UserRound } from 'lucide-react';
import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { EntityResearchState, InvestigationEntity } from '../../shared/domain';
import type { EntityProvenance } from '../lib/entityProvenance';
import { formatTemporalDate } from '../lib/entityProvenance';

export type EntityFlowNode = Node<{ entity: InvestigationEntity; research?: EntityResearchState; isResearchSubject: boolean; provenance: EntityProvenance; reducedDetail: boolean }, 'entity'>;

const iconByType = {
  person: UserRound,
  company: Building2,
  document: FileText,
  event: CalendarDays,
  location: MapPin,
  question: CircleHelp,
  note: NotebookPen,
};

const labelByType = {
  person: 'Персона',
  company: 'Компания',
  document: 'Документ',
  event: 'Событие',
  location: 'Место',
  question: 'Вопрос',
  note: 'Заметка',
};

function EntityNodeView({ data, selected }: NodeProps<EntityFlowNode>) {
  const { entity, research, isResearchSubject, provenance, reducedDetail } = data;
  const Icon = iconByType[entity.type];
  const initials = entity.title.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const questions = entity.facts.filter((fact) => fact.kind === 'question').length;
  const occurredAtLabel = formatTemporalDate(entity.occurredAt);

  return (
    <article className={`entity-card entity-card--${entity.type}${selected ? ' is-selected' : ''}${isResearchSubject ? ' is-research-subject' : ''}${research ? ` research-${research.status}` : ''}${reducedDetail ? ' is-reduced-detail' : ''}`}>
      <Handle type="target" position={Position.Left} className="entity-handle" />
      <span className="pushpin" />
      {isResearchSubject && <span className="entity-card__subject-badge">Объект дела</span>}
      <header className="entity-card__header">
        <div className="entity-card__portrait">
          {entity.type === 'person' ? initials : <Icon size={22} strokeWidth={1.7} />}
        </div>
        <div>
          <span className="entity-card__type"><Icon size={10} /> {labelByType[entity.type]}</span>
          <h3>{entity.title}</h3>
          <p>{entity.subtitle}</p>
        </div>
      </header>
      {!reducedDetail && <p className="entity-card__summary">{entity.summary}</p>}
      {!reducedDetail && occurredAtLabel && <div className="entity-card__date" title="Дата объекта или события"><CalendarDays size={10} /><time dateTime={entity.occurredAt}>{occurredAtLabel}</time></div>}
      {!reducedDetail && <div className={`entity-card__source entity-card__source--${provenance.primary.kind}`} title={provenance.primary.title}>
        {provenance.primary.kind === 'manual' ? <PenLine size={10} /> : provenance.primary.kind === 'google' ? <ContactRound size={10} /> : <FileText size={10} />}
        {'href' in provenance.primary && provenance.primary.href
          ? <a className="nodrag nopan" href={provenance.primary.href} target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>{provenance.primary.label}<ExternalLink size={9} /></a>
          : <span>{provenance.primary.label}</span>}
        {'dateLabel' in provenance.primary && provenance.primary.dateLabel && <time dateTime={provenance.primary.publishedAt}>{provenance.primary.dateLabel}</time>}
        {provenance.additionalCount > 0 && <small title={`Ещё источников: ${provenance.additionalCount}`}>+{provenance.additionalCount}</small>}
      </div>}
      {research && <div className="entity-research-status" title={research.message}>
        {research.status === 'running' ? <LoaderCircle size={12} className="spin" /> : research.status === 'completed' ? <CheckCircle2 size={12} /> : <TriangleAlert size={12} />}
        <div><strong>{research.status === 'running' ? 'Codex исследует' : research.status === 'completed' ? 'Исследование готово' : 'Ошибка исследования'}</strong><span>{research.message}</span></div>
      </div>}
      {!reducedDetail && <footer>
        <span>{entity.facts.length} факт.</span>
        {questions > 0 && <span className="question-count">{questions} вопрос.</span>}
      </footer>}
      <Handle type="source" position={Position.Right} className="entity-handle" />
    </article>
  );
}

export const EntityNode = memo(EntityNodeView, (previous, next) => previous.selected === next.selected && previous.data === next.data);
