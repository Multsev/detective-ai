import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bot, ContactRound, Crosshair, FileText, FileUp, Globe2, Link2, Plus, Search, Sparkles } from 'lucide-react';
import { IconButton, Select } from '@operator-ui/framework';
import type { CaseFact, EntityResearchState, InvestigationEntity, InvestigationRelation, SourceReference } from '../../shared/domain';
import { evidenceStyles } from '../../shared/evidenceStyle';
import { presentSource, type EntityProvenance } from '../lib/entityProvenance';

interface InspectorProps {
  entity?: InvestigationEntity;
  relation?: InvestigationRelation;
  allEntities: InvestigationEntity[];
  sources: SourceReference[];
  aiConfigured: boolean;
  research?: EntityResearchState;
  researchSubject?: InvestigationEntity;
  provenance?: EntityProvenance;
  onAddFact: (kind: CaseFact['kind'], text: string) => void;
  onAddRelation: (targetId: string, label: string) => void;
  onResearch: (question: string, file?: File) => void;
  onClose: () => void;
}

export function Inspector({ entity, relation, allEntities, sources, aiConfigured, research, researchSubject, provenance, onAddFact, onAddRelation, onResearch, onClose }: InspectorProps) {
  const [entryText, setEntryText] = useState('');
  const [entryKind, setEntryKind] = useState<CaseFact['kind']>('claim');
  const [researchQuestion, setResearchQuestion] = useState('');
  const [researchMode, setResearchMode] = useState<'web' | 'file'>('web');
  const [researchFile, setResearchFile] = useState<File>();
  const [fileError, setFileError] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetId, setTargetId] = useState('');
  const [relationLabel, setRelationLabel] = useState('');
  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);

  useEffect(() => {
    setResearchMode('web');
    setResearchFile(undefined);
    setFileError(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [entity?.id]);

  if (relation) {
    const visual = evidenceStyles[relation.status];
    const from = allEntities.find((item) => item.id === relation.sourceId);
    const to = allEntities.find((item) => item.id === relation.targetId);
    return (
      <aside className="inspector">
        <IconButton icon="error" label="Закрыть инспектор" className="inspector-close" onClick={onClose} />
        <span className="inspector__eyebrow">Выбранная связь</span>
        <h2>{relation.label}</h2>
        <p className="relation-direction">{from?.title ?? relation.sourceId} <span>→</span> {to?.title ?? relation.targetId}</p>
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
              : <a className="source-link" href={source.url} target="_blank" rel="noreferrer" key={id}>{source.title}<ArrowUpRight size={13} /></a>;
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
        <p>Здесь появятся факты, вопросы, источники и инструменты исследования.</p>
      </aside>
    );
  }

  const relatedEntities = allEntities.filter((item) => item.id !== entity.id);

  function submitEntry() {
    const text = entryText.trim();
    if (!text) return;
    onAddFact(entryKind, text);
    setEntryText('');
  }

  return (
    <aside className="inspector">
      <IconButton icon="error" label="Закрыть инспектор" className="inspector-close" onClick={onClose} />
      <span className="inspector__eyebrow">Карточка · {entity.type}</span>
      <h2>{entity.title}</h2>
      <p className="inspector__subtitle">{entity.subtitle}</p>
      <p className="body-copy">{entity.summary}</p>
      {provenance && <div className="inspector-entity-sources" aria-label="Источники карточки">
        <strong>Источник</strong>
        {provenance.sources.length > 0 ? provenance.sources.map((source) => source.href
          ? <a href={source.href} target="_blank" rel="noreferrer" title={source.title} key={source.id}>{source.label}<ArrowUpRight size={9} /></a>
          : <span title={source.title} key={source.id}>{source.label}</span>)
          : <span title={provenance.primary.title}>{provenance.primary.label}</span>}
      </div>}

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

      <section className="inspector-section">
        <div className="section-heading"><h3>Факты и вопросы</h3><span>{entity.facts.length}</span></div>
        <div className="fact-list">
          {entity.facts.map((fact) => {
            const factSources = fact.sourceIds
              .map((sourceId) => sourceById.get(sourceId))
              .filter((source): source is SourceReference => Boolean(source))
              .map(presentSource);
            return <article className={`fact-item fact-item--${fact.kind}`} key={fact.id}>
              <span>{fact.kind === 'question' ? '?' : fact.kind === 'note' ? '✎' : '•'}</span>
              <div>
                <p>{fact.text}</p>
                <small>{evidenceStyles[fact.status].label} · {Math.round(fact.confidence * 100)}%</small>
                <div className="fact-sources">
                  {factSources.map((source) => source.href
                    ? <a href={source.href} target="_blank" rel="noreferrer" title={source.title} key={source.id}>{source.label}<ArrowUpRight size={9} /></a>
                    : <span title={source.title} key={source.id}>{source.label}</span>)}
                  {factSources.length === 0 && <span>{fact.createdBy === 'user' ? 'Вручную' : 'Источник не указан'}</span>}
                </div>
              </div>
            </article>;
          })}
          {entity.facts.length === 0 && <p className="muted-copy">Пока нет записей.</p>}
        </div>
        <div className="entry-composer">
          <select value={entryKind} onChange={(event) => setEntryKind(event.target.value as CaseFact['kind'])}>
            <option value="claim">Мой факт</option>
            <option value="question">Вопрос</option>
            <option value="note">Заметка</option>
          </select>
          <textarea value={entryText} onChange={(event) => setEntryText(event.target.value)} placeholder="Добавить к карточке…" />
          <button onClick={submitEntry}><Plus size={14} /> Добавить</button>
        </div>
      </section>

      <section className="inspector-section">
        <div className="section-heading"><h3>Ручная связь</h3><Link2 size={14} /></div>
        <div className="relation-composer">
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            <option value="">Выберите карточку…</option>
            {relatedEntities.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
          </select>
          <input value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} placeholder="Например: работает в" />
          <button disabled={!targetId || !relationLabel.trim()} onClick={() => {
            onAddRelation(targetId, relationLabel.trim());
            setTargetId('');
            setRelationLabel('');
          }}>Связать</button>
        </div>
      </section>
    </aside>
  );
}
