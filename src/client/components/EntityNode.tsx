import { Building2, CalendarDays, CheckCircle2, CircleHelp, ContactRound, ExternalLink, FileText, LoaderCircle, MapPin, MinusCircle, NotebookPen, PenLine, TriangleAlert, UserRound } from 'lucide-react';
import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { EntityResearchState, InvestigationEntity } from '../../shared/domain';
import type { EntityProvenance } from '../lib/entityProvenance';
import { formatTemporalDate } from '../lib/entityProvenance';

export type EntityFlowNode = Node<{ entity: InvestigationEntity; research?: EntityResearchState; unreadChangeCount: number; isResearchSubject: boolean; isActiveSelection: boolean; provenance: EntityProvenance; reducedDetail: boolean; entering: boolean; removing: boolean; motionState?: 'updated' | 'no-change' | 'error' }, 'entity'>;

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
  const { entity, research, unreadChangeCount, isResearchSubject, isActiveSelection, provenance, reducedDetail, entering, removing, motionState } = data;
  const Icon = iconByType[entity.type];
  const initials = entity.title.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const occurredAtLabel = formatTemporalDate(entity.occurredAt);
  const primaryAttributes = (entity.attributes ?? []).slice(0, 2);
  const questionStatus = entity.type === 'question' ? (entity.question?.status ?? 'open') : undefined;
  const compactResolvedQuestion = questionStatus === 'answered' || questionStatus === 'dismissed';
  const questionStatusLabel = questionStatus ? ({ open: 'Открыт', researching: 'Исследуется', partial: 'Частичный ответ', answered: 'Решён', blocked: 'Нет ответа', contradicted: 'Противоречие', dismissed: 'Закрыт' } as const)[questionStatus] : undefined;

  return (
    <article className={`entity-card entity-card--${entity.type}${questionStatus ? ` question-${questionStatus}` : ''}${compactResolvedQuestion ? ' is-question-compact' : ''}${selected ? ' is-selected' : ''}${isActiveSelection ? ' is-active-selection' : ''}${isResearchSubject ? ' is-research-subject' : ''}${research ? ` research-${research.status}` : ''}${reducedDetail ? ' is-reduced-detail' : ''}${entering ? ' is-entering' : ''}${removing ? ' is-removing' : ''}${motionState ? ` motion-${motionState}` : ''}`}>
      <Handle type="target" position={Position.Left} className="entity-handle" title="Отпустите здесь, чтобы связать карточки" aria-label="Вход связи" />
      {isResearchSubject && <span className="entity-card__subject-badge">Объект дела</span>}
      {unreadChangeCount > 0 && <span className="entity-card__update-badge" title={`Непрочитанных обновлений: ${unreadChangeCount}`} aria-label={`Непрочитанных обновлений: ${unreadChangeCount}`}>{unreadChangeCount > 99 ? '99+' : unreadChangeCount}</span>}
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
      {questionStatusLabel && <div className="entity-card__question-status">{questionStatusLabel}{entity.question?.researchRunIds.length ? <small>{entity.question.researchRunIds.length} попыт.</small> : null}</div>}
      {!reducedDetail && !compactResolvedQuestion && <p className="entity-card__summary">{entity.summary}</p>}
      {!reducedDetail && compactResolvedQuestion && entity.question?.answer && <p className="entity-card__question-answer">{entity.question.answer}</p>}
      {!reducedDetail && primaryAttributes.length > 0 && <dl className="entity-card__attributes">
        {primaryAttributes.map((attribute) => <div key={attribute.id}><dt>{attribute.label}</dt><dd title={attribute.value}>{attribute.value}</dd></div>)}
      </dl>}
      {!reducedDetail && occurredAtLabel && <div className="entity-card__date" title="Дата объекта или события"><CalendarDays size={10} /><time dateTime={entity.occurredAt}>{occurredAtLabel}</time></div>}
      {!reducedDetail && !compactResolvedQuestion && <div className={`entity-card__source entity-card__source--${provenance.primary.kind}`} title={provenance.primary.title}>
        {provenance.primary.kind === 'manual' ? <PenLine size={10} /> : provenance.primary.kind === 'google' ? <ContactRound size={10} /> : <FileText size={10} />}
        {'href' in provenance.primary && provenance.primary.href
          ? <a className="nodrag nopan" href={provenance.primary.href} target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>{provenance.primary.label}<ExternalLink size={9} /></a>
          : <span>{provenance.primary.label}</span>}
        {'dateLabel' in provenance.primary && provenance.primary.dateLabel && <time dateTime={provenance.primary.publishedAt}>{provenance.primary.dateLabel}</time>}
        {provenance.additionalCount > 0 && <small title={`Ещё источников: ${provenance.additionalCount}`}>+{provenance.additionalCount}</small>}
      </div>}
      {motionState && <div className={`entity-motion-feedback is-${motionState}`} role="status">{motionState === 'updated' ? <CheckCircle2 size={11} /> : motionState === 'no-change' ? <MinusCircle size={11} /> : <TriangleAlert size={11} />}<span>{motionState === 'updated' ? 'Карточка дополнена' : motionState === 'no-change' ? 'Новых данных нет' : 'Ошибка исследования'}</span></div>}
      {research && <div className="entity-research-status" title={research.message} data-stage={research.stage}>
        {research.status === 'running' ? <LoaderCircle size={12} className="spin" /> : research.status === 'completed' ? <CheckCircle2 size={12} /> : <TriangleAlert size={12} />}
        <div key={`${research.status}:${research.stage}`}><strong>{research.status === 'running' ? (research.mode === 'relationships' ? 'Codex ищет связи' : research.mode === 'question_resolution' ? 'Codex проверяет вопрос' : 'Codex ищет информацию') : research.status === 'completed' ? (research.mode === 'relationships' ? 'Связи проверены' : research.mode === 'question_resolution' ? 'Вопрос проверен' : 'Информация обновлена') : 'Ошибка исследования'}</strong><span>{research.message}</span></div>
      </div>}
      <Handle type="source" position={Position.Right} className="entity-handle" title="Потяните к другой карточке, чтобы создать связь" aria-label="Создать связь" />
    </article>
  );
}

export const EntityNode = memo(EntityNodeView, (previous, next) => previous.selected === next.selected && previous.data === next.data);
