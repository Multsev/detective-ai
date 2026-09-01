import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, ContactRound, FileText, FileUp, IdCard, Plus, Search, StickyNote, Trash2 } from 'lucide-react';
import { Button, IconButton, PlainTextEditor, Select, TextField } from '../ui';
import type { CaseChange, CaseMaterial, EntityAttributeKind, EntityResearchState, InvestigationEntity, InvestigationRelation, ResearchRun, SourceReference } from '../../shared/domain';
import { getAttributeHref, getEntityAttributeDefinitions } from '../../shared/entityAttributeCatalog';
import { evidenceStyles } from '../../shared/evidenceStyle';
import { formatTemporalDate, type EntityProvenance } from '../lib/entityProvenance';
import { researchFileAccept, researchFileFormatSummary } from '../../shared/researchFileTypes';
import { getSourceFreshness } from '../../shared/sourceFreshness';

interface InspectorProps {
  entity?: InvestigationEntity;
  relation?: InvestigationRelation;
  allEntities: InvestigationEntity[];
  sources: SourceReference[];
  research?: EntityResearchState;
  provenance?: EntityProvenance;
  materials: CaseMaterial[];
  researchRuns: ResearchRun[];
  changes: CaseChange[];
  onAddAttribute: (input: { key: string; label: string; value: string; kind: EntityAttributeKind }) => void;
  onAddFileMaterial: (file: File) => void;
  onAddNoteMaterial: (name: string, content: string) => void;
  onRemoveMaterial: (materialId: string) => void;
  onUpdateRelation: (input: { label: string; explanation: string }) => void;
  onMarkChangesRead: (changeIds: string[]) => void;
  onClose: () => void;
}

const materialStatusLabels: Record<CaseMaterial['status'], string> = {
  pending: 'Новое', processing: 'Обрабатывается', processed: 'Обработано', changed: 'Изменено', error: 'Ошибка',
};

function sourceFreshnessLabel(source: SourceReference): string {
  const status = getSourceFreshness(source);
  if (status === 'static') return 'статический источник';
  if (status === 'due') return 'требует повторной проверки';
  if (status === 'unknown') return 'свежесть неизвестна';
  const checkedAt = source.lastCheckedAt || source.accessedAt;
  return checkedAt ? `проверено ${new Date(checkedAt.length <= 10 ? `${checkedAt}T00:00:00` : checkedAt).toLocaleDateString('ru-RU')}` : 'проверено';
}

export function Inspector({ entity, relation, allEntities, sources, research, provenance, materials, researchRuns, changes, onAddAttribute, onAddFileMaterial, onAddNoteMaterial, onRemoveMaterial, onUpdateRelation, onMarkChangesRead, onClose }: InspectorProps) {
  const [relationLabel, setRelationLabel] = useState('');
  const [relationExplanation, setRelationExplanation] = useState('');
  const [attributeKey, setAttributeKey] = useState('');
  const [attributeValue, setAttributeValue] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteName, setNoteName] = useState('Заметка');
  const [noteContent, setNoteContent] = useState('');
  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);

  useEffect(() => {
    setAttributeKey('');
    setAttributeValue('');
    setNoteOpen(false);
    setNoteName('Заметка');
    setNoteContent('');
  }, [entity?.id]);

  useEffect(() => {
    setRelationLabel(relation?.label ?? '');
    setRelationExplanation(relation?.explanation ?? '');
  }, [relation?.id, relation?.explanation, relation?.label]);

  if (relation) {
    const visual = evidenceStyles[relation.status];
    const from = allEntities.find((item) => item.id === relation.sourceId);
    const to = allEntities.find((item) => item.id === relation.targetId);
    const relationDate = formatTemporalDate(relation.occurredAt);
    return (
      <aside className="inspector">
        <IconButton icon="error" label="Закрыть инспектор" className="inspector-close" onClick={onClose} />
        <span className="inspector__eyebrow">Выбранная связь</span>
        <h2>{relation.label}</h2>
        <p className="relation-direction">{from?.title ?? relation.sourceId} <span>→</span> {to?.title ?? relation.targetId}</p>
        <section className="inspector-section relation-properties">
          <h3>Свойства связи</h3>
          <label><span>Название</span><TextField value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} placeholder="Например: работает в" /></label>
          <label><span>Описание</span><PlainTextEditor value={relationExplanation} onChange={(event) => setRelationExplanation(event.target.value)} placeholder="Почему эти карточки связаны?" /></label>
          <Button variant="primary" disabled={!relationLabel.trim()} onClick={() => onUpdateRelation({ label: relationLabel, explanation: relationExplanation })}>Сохранить свойства</Button>
        </section>
        {relationDate && <div className="inspector-object-date"><CalendarDays size={12} /><span>Дата связи</span><time dateTime={relation.occurredAt}>{relationDate}</time></div>}
        <div className="confidence-card">
          <div><i style={{ background: visual.color }} /><span>{visual.label}</span></div>
          <strong>{Math.round(relation.confidence * 100)}%</strong>
        </div>
        <section className="inspector-section"><h3>Почему связь показана</h3><p className="body-copy">{relation.explanation}</p></section>
        {changes.length > 0 && <section className="inspector-section relation-changes-section"><div className="section-heading"><h3>Что нового</h3><span>{changes.filter((change) => !change.readAt).length || changes.length}</span></div>{changes.filter((change) => !change.readAt).length > 0 && <Button onClick={() => onMarkChangesRead(changes.filter((change) => !change.readAt).map((change) => change.id))}>Отметить прочитанным</Button>}<div className="entity-changes-list">{changes.slice(0, 8).map((change) => <article className={change.readAt ? 'is-read' : 'is-unread'} key={change.id}><small>{new Date(change.detectedAt).toLocaleString('ru-RU')}</small><strong>{change.summary}</strong>{change.fields.length > 0 && <dl>{change.fields.map((field) => <div key={field.field}><dt>{field.field}</dt><dd>{field.before && <del>{field.before}</del>}{field.after && <ins>{field.after}</ins>}</dd></div>)}</dl>}</article>)}</div></section>}
        <section className="inspector-section">
          <h3>Источники</h3>
          {relation.sourceIds.length === 0 && <p className="muted-copy">Источник пока не прикреплён.</p>}
          {relation.sourceIds.map((id) => {
            const source = sourceById.get(id);
            if (!source) return null;
            return source.kind === 'uploaded_file' || source.kind === 'google_contact'
              ? <div className="source-link source-link--file" key={id}><span>{source.kind === 'google_contact' ? <ContactRound size={13} /> : <FileText size={13} />}{source.title}</span><small>{source.kind === 'google_contact' ? 'личный контакт' : 'загруженный файл'}</small></div>
              : <a className={`source-link is-${getSourceFreshness(source)}`} href={source.url} target="_blank" rel="noreferrer" key={id}><span>{source.title}</span><small>{source.publishedAt ? `${formatTemporalDate(source.publishedAt)} · ` : ''}{sourceFreshnessLabel(source)}</small><ArrowUpRight size={13} /></a>;
          })}
        </section>
      </aside>
    );
  }

  if (!entity) {
    return (
      <aside className="inspector inspector--empty">
        <div className="empty-inspector-icon"><Search size={24} /></div>
        <h2>Выберите карточку</h2>
        <p>Здесь появятся реквизиты, источники и инструменты исследования выбранного объекта.</p>
      </aside>
    );
  }

  const entityDate = formatTemporalDate(entity.occurredAt);
  const attributeDefinitions = getEntityAttributeDefinitions(entity.type);
  const selectedAttributeDefinition = attributeDefinitions.find((definition) => definition.key === attributeKey) ?? attributeDefinitions[0];
  const unreadChanges = changes.filter((change) => !change.readAt);

  return (
    <aside className="inspector">
      <IconButton icon="error" label="Закрыть инспектор" className="inspector-close" onClick={onClose} />
      <span className="inspector__eyebrow">Карточка · {entity.type}</span>
      <h2>{entity.title}</h2>
      <p className="inspector__subtitle">{entity.subtitle}</p>
      <p className="body-copy">{entity.summary}</p>
      {entity.type === 'question' && entity.question && <section className={`inspector-section question-details is-${entity.question.status}`}>
        <div className="section-heading"><h3>Состояние вопроса</h3><span>{({ open: 'Открыт', researching: 'Исследуется', partial: 'Частично', answered: 'Решён', blocked: 'Нет ответа', contradicted: 'Противоречие', dismissed: 'Закрыт' } as const)[entity.question.status]}</span></div>
        <dl><div><dt>Критерий ответа</dt><dd>{entity.question.successCriteria}</dd></div><div><dt>Попыток</dt><dd>{entity.question.researchRunIds.length}</dd></div></dl>
        {entity.question.answer && <div className="question-details__answer"><strong>Ответ</strong><p>{entity.question.answer}</p></div>}
      </section>}
      {changes.length > 0 && <details className="inspector-section entity-changes-section" open={unreadChanges.length > 0}>
        <summary><span>Что нового</span><small>{unreadChanges.length ? `${unreadChanges.length} новых` : changes.length}</small></summary>
        {unreadChanges.length > 0 && <div className="entity-changes-toolbar"><Button onClick={() => onMarkChangesRead(unreadChanges.map((change) => change.id))}>Отметить прочитанным</Button></div>}
        <div className="entity-changes-list">{changes.slice(0, 12).map((change) => <article className={change.readAt ? 'is-read' : 'is-unread'} key={change.id}><small>{new Date(change.detectedAt).toLocaleString('ru-RU')}</small><strong>{change.summary}</strong>{change.fields.length > 0 && <dl>{change.fields.slice(0, 4).map((field) => <div key={field.field}><dt>{field.field}</dt><dd>{field.before && <del>{field.before}</del>}{field.after && <ins>{field.after}</ins>}</dd></div>)}</dl>}</article>)}</div>
      </details>}
      {entityDate && <div className="inspector-object-date"><CalendarDays size={12} /><span>Дата объекта</span><time dateTime={entity.occurredAt}>{entityDate}</time></div>}
      {provenance && <div className="inspector-entity-sources" aria-label="Источники карточки">
        <strong>Источник</strong>
        {provenance.sources.length > 0 ? provenance.sources.map((source) => {
          const reference = sourceById.get(source.id);
          const freshness = reference ? sourceFreshnessLabel(reference) : '';
          return source.href
            ? <a href={source.href} target="_blank" rel="noreferrer" title={`${source.title}${freshness ? ` · ${freshness}` : ''}`} key={source.id}>{source.label}{source.dateLabel && <time dateTime={source.publishedAt}>{source.dateLabel}</time>}{freshness && <em>{freshness}</em>}<ArrowUpRight size={9} /></a>
            : <span title={`${source.title}${freshness ? ` · ${freshness}` : ''}`} key={source.id}>{source.label}{source.dateLabel && <time dateTime={source.publishedAt}>{source.dateLabel}</time>}{freshness && <em>{freshness}</em>}</span>;
        })
          : <span title={provenance.primary.title}>{provenance.primary.label}</span>}
      </div>}

      <section className="inspector-section entity-attributes-section">
        <div className="section-heading"><h3>Реквизиты</h3><span>{entity.attributes?.length ?? 0}</span></div>
        <div className="entity-attribute-list">
          {(entity.attributes ?? []).map((attribute) => {
            const href = getAttributeHref(attribute);
            const attributeSources = attribute.sourceIds.map((id) => sourceById.get(id)).filter((source): source is SourceReference => Boolean(source));
            const sourceTitle = attributeSources.map((source) => source.title).join(', ') || (attribute.createdBy === 'user' ? 'Добавлено вручную' : attribute.createdBy === 'integration' ? 'Личная интеграция' : 'Источник не указан');
            const primarySource = attributeSources[0];
            return <div className="entity-attribute-row" key={attribute.id}>
              <span>{attribute.label}</span>
              {href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" title={attribute.value}>{attribute.value}<ArrowUpRight size={10} /></a> : <strong title={attribute.value}>{attribute.value}</strong>}
              {primarySource && primarySource.kind !== 'uploaded_file' && primarySource.kind !== 'google_contact'
                ? <a className="entity-attribute-source" href={primarySource.url} target="_blank" rel="noreferrer" title={sourceTitle}>{primarySource.publisher || primarySource.title}<ArrowUpRight size={8} /></a>
                : <small title={sourceTitle}>{sourceTitle}</small>}
            </div>;
          })}
          {(entity.attributes?.length ?? 0) === 0 && <p className="muted-copy">Реквизиты пока не заполнены. Codex начнёт исследование с их поиска.</p>}
        </div>
        <div className="attribute-composer">
          <Select aria-label="Тип реквизита" value={selectedAttributeDefinition.key} onChange={(event) => setAttributeKey(event.target.value)}>
            {attributeDefinitions.map((definition) => <option value={definition.key} key={definition.key}>{definition.label}</option>)}
          </Select>
          <TextField aria-label="Значение реквизита" value={attributeValue} onChange={(event) => setAttributeValue(event.target.value)} placeholder="Введите значение" />
          <Button disabled={!attributeValue.trim()} onClick={() => {
            onAddAttribute({ ...selectedAttributeDefinition, value: attributeValue.trim() });
            setAttributeValue('');
          }}><IdCard size={13} />Добавить</Button>
        </div>
      </section>

      <details className="inspector-section material-section">
        <summary><span>Материалы</span><small>{materials.length}{materials.some((material) => material.status !== 'processed') ? ` · ${materials.filter((material) => material.status !== 'processed').length} новых` : ''}</small></summary>
        <div className="material-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
          event.preventDefault();
          for (const file of event.dataTransfer.files) onAddFileMaterial(file);
        }}>
          <FileUp size={15} /><span>Перетащите {researchFileFormatSummary}</span>
          <label className="detective-button material-file-trigger">
            <span>Выбрать</span>
            <input type="file" multiple accept={researchFileAccept} aria-label="Выбрать материалы на компьютере" onChange={(event) => {
              for (const file of event.target.files ?? []) onAddFileMaterial(file);
              event.currentTarget.value = '';
            }} />
          </label>
        </div>
        <div className="material-toolbar"><Button onClick={() => setNoteOpen((current) => !current)}><Plus size={12} />Заметка</Button></div>
        {noteOpen && <div className="material-note-composer">
          <TextField value={noteName} onChange={(event) => setNoteName(event.target.value)} placeholder="Название заметки" />
          <PlainTextEditor value={noteContent} onChange={(event) => setNoteContent(event.target.value)} placeholder="Факт, наблюдение или исходные сведения" />
          <footer><Button onClick={() => setNoteOpen(false)}>Отмена</Button><Button variant="primary" disabled={!noteContent.trim()} onClick={() => {
            onAddNoteMaterial(noteName, noteContent);
            setNoteContent('');
            setNoteOpen(false);
          }}>Добавить</Button></footer>
        </div>}
        <div className="material-list">
          {materials.map((material) => <div className={`material-row is-${material.status}`} key={material.id} title={material.errorMessage}>
            <span>{material.kind === 'note' ? <StickyNote size={12} /> : <FileText size={12} />}</span>
            <div><strong>{material.name}</strong><small>{materialStatusLabels[material.status]}{material.processedAt ? ` · ${new Date(material.processedAt).toLocaleString('ru-RU')}` : ''}</small></div>
            <button className="material-remove" type="button" title={`Удалить материал ${material.name}`} aria-label={`Удалить материал ${material.name}`} onClick={() => onRemoveMaterial(material.id)}><Trash2 size={11} /></button>
          </div>)}
          {materials.length === 0 && <p className="muted-copy">Добавьте документы или заметки. При следующем поиске Codex обработает только новые материалы.</p>}
        </div>
      </details>

      {researchRuns.length > 0 && <details className="inspector-section research-history-section">
        <summary><span>История исследований</span><small>{researchRuns.length}</small></summary>
        <div className="research-history-list">{researchRuns.slice(0, 8).map((run) => <div className={`research-history-row is-${run.status}`} key={run.id}><span>{run.status === 'completed' ? '✓' : run.status === 'error' ? '!' : '…'}</span><div><strong>{run.mode === 'relationships' ? 'Поиск связи' : run.mode === 'question_resolution' ? 'Проверка вопроса' : run.includeWeb ? 'Материалы и открытые источники' : 'Материалы карточки'}{run.changeIds.length ? ` · ${run.changeIds.length} изм.` : ''}</strong><small>{new Date(run.startedAt).toLocaleString('ru-RU')} · {run.summary || run.errorMessage || 'Выполняется'}</small></div></div>)}</div>
      </details>}

      {research && <section className="research-box"><div className={`inspector-research-state is-${research.status}`}><strong>{research.status === 'running' ? (research.mode === 'relationships' ? 'Идёт поиск связи' : 'Идёт поиск информации') : research.status === 'completed' ? 'Исследование завершено' : 'Ошибка исследования'}</strong><span>{research.source === 'file' && research.fileName ? `${research.fileName} · ${research.message}` : research.message}</span>{research.result && <p>{research.result.summary}</p>}</div></section>}

    </aside>
  );
}
