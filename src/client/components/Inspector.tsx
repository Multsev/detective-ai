import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bot, CalendarDays, ContactRound, Crosshair, FileText, FileUp, Globe2, IdCard, Search, Sparkles } from 'lucide-react';
import { Button, IconButton, PlainTextEditor, Select, TextField } from '@operator-ui/framework';
import type { EntityAttributeKind, EntityResearchState, InvestigationEntity, InvestigationRelation, SourceReference } from '../../shared/domain';
import { getAttributeHref, getEntityAttributeDefinitions } from '../../shared/entityAttributeCatalog';
import { evidenceStyles } from '../../shared/evidenceStyle';
import { formatTemporalDate, type EntityProvenance } from '../lib/entityProvenance';

interface InspectorProps {
  entity?: InvestigationEntity;
  relation?: InvestigationRelation;
  allEntities: InvestigationEntity[];
  sources: SourceReference[];
  aiConfigured: boolean;
  research?: EntityResearchState;
  researchSubject?: InvestigationEntity;
  provenance?: EntityProvenance;
  onAddAttribute: (input: { key: string; label: string; value: string; kind: EntityAttributeKind }) => void;
  onUpdateRelation: (input: { label: string; explanation: string }) => void;
  onResearch: (question: string, file?: File) => void;
  onClose: () => void;
}

export function Inspector({ entity, relation, allEntities, sources, aiConfigured, research, researchSubject, provenance, onAddAttribute, onUpdateRelation, onResearch, onClose }: InspectorProps) {
  const [researchQuestion, setResearchQuestion] = useState('');
  const [researchMode, setResearchMode] = useState<'web' | 'file'>('web');
  const [researchFile, setResearchFile] = useState<File>();
  const [fileError, setFileError] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [relationLabel, setRelationLabel] = useState('');
  const [relationExplanation, setRelationExplanation] = useState('');
  const [attributeKey, setAttributeKey] = useState('');
  const [attributeValue, setAttributeValue] = useState('');
  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);

  useEffect(() => {
    setResearchMode('web');
    setResearchFile(undefined);
    setFileError(undefined);
    setAttributeKey('');
    setAttributeValue('');
    if (fileInputRef.current) fileInputRef.current.value = '';
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
        <section className="inspector-section">
          <h3>Источники</h3>
          {relation.sourceIds.length === 0 && <p className="muted-copy">Источник пока не прикреплён.</p>}
          {relation.sourceIds.map((id) => {
            const source = sourceById.get(id);
            if (!source) return null;
            return source.kind === 'uploaded_file' || source.kind === 'google_contact'
              ? <div className="source-link source-link--file" key={id}><span>{source.kind === 'google_contact' ? <ContactRound size={13} /> : <FileText size={13} />}{source.title}</span><small>{source.kind === 'google_contact' ? 'личный контакт' : 'загруженный файл'}</small></div>
              : <a className="source-link" href={source.url} target="_blank" rel="noreferrer" key={id}><span>{source.title}</span>{source.publishedAt && <small>{formatTemporalDate(source.publishedAt)}</small>}<ArrowUpRight size={13} /></a>;
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

  return (
    <aside className="inspector">
      <IconButton icon="error" label="Закрыть инспектор" className="inspector-close" onClick={onClose} />
      <span className="inspector__eyebrow">Карточка · {entity.type}</span>
      <h2>{entity.title}</h2>
      <p className="inspector__subtitle">{entity.subtitle}</p>
      <p className="body-copy">{entity.summary}</p>
      {entityDate && <div className="inspector-object-date"><CalendarDays size={12} /><span>Дата объекта</span><time dateTime={entity.occurredAt}>{entityDate}</time></div>}
      {provenance && <div className="inspector-entity-sources" aria-label="Источники карточки">
        <strong>Источник</strong>
        {provenance.sources.length > 0 ? provenance.sources.map((source) => source.href
          ? <a href={source.href} target="_blank" rel="noreferrer" title={source.title} key={source.id}>{source.label}{source.dateLabel && <time dateTime={source.publishedAt}>{source.dateLabel}</time>}<ArrowUpRight size={9} /></a>
          : <span title={source.title} key={source.id}>{source.label}{source.dateLabel && <time dateTime={source.publishedAt}>{source.dateLabel}</time>}</span>)
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

      <section className="research-box">
        <div className="research-box__title"><Sparkles size={15} /><strong>AI-исследование</strong></div>
        {researchSubject && <div className="research-subject-context"><Crosshair size={12} /><span>{researchSubject.id === entity.id ? 'Текущий объект дела' : 'Исследование в отношении'}</span><strong>{researchSubject.title}</strong></div>}
        {research && <div className={`inspector-research-state is-${research.status}`}><strong>{research.status === 'running' ? 'Идёт работа' : research.status === 'completed' ? 'Последнее исследование готово' : 'Исследование завершилось с ошибкой'}</strong><span>{research.source === 'file' && research.fileName ? `${research.fileName} · ${research.message}` : research.message}</span>{research.result && <p>{research.result.summary}</p>}</div>}
        <label className="research-source-select"><span>Источник</span><Select value={researchMode} disabled={research?.status === 'running'} onChange={(event) => setResearchMode(event.target.value as 'web' | 'file')}><option value="web">Открытые источники</option><option value="file">PDF или Markdown-файл</option></Select></label>
        {researchMode === 'file' && <div className="research-file-picker">
          <input ref={fileInputRef} tabIndex={-1} type="file" accept=".pdf,.md,.markdown,application/pdf,text/markdown" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && file.size > 12 * 1024 * 1024) {
              setResearchFile(undefined);
              setFileError('Файл больше 12 МБ.');
              return;
            }
            setResearchFile(file);
            setFileError(undefined);
          }} />
          <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}><FileUp size={14} />Выбрать файл</button>
          <div title={researchFile?.name}>{researchFile ? <><FileText size={13} /><span>{researchFile.name}</span><small>{Math.max(1, Math.round(researchFile.size / 1024))} КБ</small></> : <><Globe2 size={13} /><span>PDF, .md или .markdown</span><small>до 12 МБ</small></>}</div>
          {fileError && <p>{fileError}</p>}
        </div>}
        <textarea value={researchQuestion} onChange={(event) => setResearchQuestion(event.target.value)} placeholder={researchMode === 'file' ? 'Что найти или проверить в документе?' : 'Что проверить? Например: найти связанные компании и официальные источники'} />
        <button className="primary-button" disabled={research?.status === 'running' || !aiConfigured || (researchMode === 'file' && !researchFile)} onClick={() => onResearch(researchQuestion, researchMode === 'file' ? researchFile : undefined)}>
          <Bot size={15} />{research?.status === 'running' ? 'Идёт исследование…' : !aiConfigured ? 'Codex не готов' : researchMode === 'file' ? 'Исследовать файл' : research ? 'Исследовать снова' : 'Исследовать'}
        </button>
      </section>

    </aside>
  );
}
