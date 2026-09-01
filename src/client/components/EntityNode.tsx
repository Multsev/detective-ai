import { Building2, CircleHelp, FileText, MapPin, NotebookPen, UserRound, CalendarDays } from 'lucide-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { InvestigationEntity } from '../../shared/domain';

export type EntityFlowNode = Node<{ entity: InvestigationEntity }, 'entity'>;

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

export function EntityNode({ data, selected }: NodeProps<EntityFlowNode>) {
  const { entity } = data;
  const Icon = iconByType[entity.type];
  const initials = entity.title.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const questions = entity.facts.filter((fact) => fact.kind === 'question').length;

  return (
    <article className={`entity-card entity-card--${entity.type}${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="entity-handle" />
      <span className="pushpin" />
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
      <p className="entity-card__summary">{entity.summary}</p>
      <footer>
        <span>{entity.facts.length} факт.</span>
        {questions > 0 && <span className="question-count">{questions} вопрос.</span>}
      </footer>
      <Handle type="source" position={Position.Right} className="entity-handle" />
    </article>
  );
}
