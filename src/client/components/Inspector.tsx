import { useMemo, useState } from 'react';
import { ArrowUpRight, Bot, Link2, Plus, Search, Sparkles } from 'lucide-react';
import type { CaseFact, InvestigationEntity, InvestigationRelation, SourceReference } from '../../shared/domain';
import { evidenceStyles } from '../../shared/evidenceStyle';

interface InspectorProps {
  entity?: InvestigationEntity;
  relation?: InvestigationRelation;
  allEntities: InvestigationEntity[];
  sources: SourceReference[];
  aiConfigured: boolean;
  researching: boolean;
  onAddFact: (kind: CaseFact['kind'], text: string) => void;
  onAddRelation: (targetId: string, label: string) => void;
  onResearch: (question: string) => void;
}

export function Inspector({ entity, relation, allEntities, sources, aiConfigured, researching, onAddFact, onAddRelation, onResearch }: InspectorProps) {
  const [entryText, setEntryText] = useState('');
  const [entryKind, setEntryKind] = useState<CaseFact['kind']>('claim');
  const [researchQuestion, setResearchQuestion] = useState('');
  const [targetId, setTargetId] = useState('');
  const [relationLabel, setRelationLabel] = useState('');
  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);

  if (relation) {
    const visual = evidenceStyles[relation.status];
    const from = allEntities.find((item) => item.id === relation.sourceId);
    const to = allEntities.find((item) => item.id === relation.targetId);
    return (
      <aside className="inspector">
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
            return source && <a className="source-link" href={source.url} target="_blank" rel="noreferrer" key={id}>{source.title}<ArrowUpRight size={13} /></a>;
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
      <span className="inspector__eyebrow">Карточка · {entity.type}</span>
      <h2>{entity.title}</h2>
      <p className="inspector__subtitle">{entity.subtitle}</p>
      <p className="body-copy">{entity.summary}</p>

      <section className="research-box">
        <div className="research-box__title"><Sparkles size={15} /><strong>AI-исследование</strong></div>
        <textarea value={researchQuestion} onChange={(event) => setResearchQuestion(event.target.value)} placeholder="Что проверить? Например: найти связанные компании и официальные источники" />
        <button className="primary-button" disabled={researching || !aiConfigured} onClick={() => onResearch(researchQuestion)}>
          <Bot size={15} />{researching ? 'Идёт поиск…' : aiConfigured ? 'Исследовать' : 'Codex не готов'}
        </button>
      </section>

      <section className="inspector-section">
        <div className="section-heading"><h3>Факты и вопросы</h3><span>{entity.facts.length}</span></div>
        <div className="fact-list">
          {entity.facts.map((fact) => (
            <article className={`fact-item fact-item--${fact.kind}`} key={fact.id}>
              <span>{fact.kind === 'question' ? '?' : fact.kind === 'note' ? '✎' : '•'}</span>
              <div><p>{fact.text}</p><small>{evidenceStyles[fact.status].label} · {Math.round(fact.confidence * 100)}%</small></div>
            </article>
          ))}
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
