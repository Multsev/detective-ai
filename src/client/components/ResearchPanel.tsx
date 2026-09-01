import { AlertTriangle, ArrowUpRight, Check, Network, Plus, ShieldCheck, X } from 'lucide-react';
import type { ResearchResult } from '../../shared/domain';
import { evidenceStyles } from '../../shared/evidenceStyle';

interface ResearchPanelProps {
  result: ResearchResult;
  onAccept: () => void;
  onClose: () => void;
}

export function ResearchPanel({ result, onAccept, onClose }: ResearchPanelProps) {
  return (
    <div className="research-panel-backdrop">
      <section className="research-panel">
        <header>
          <div><span className="inspector__eyebrow">Предложения AI · требуют проверки</span><h2>Результаты исследования</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </header>
        <div className="research-panel__content">
          <div className="research-summary">
            <ShieldCheck size={20} />
            <div><strong>Проверка личности</strong><p>{result.identityAssessment}</p></div>
          </div>
          <p className="body-copy">{result.summary}</p>

          <div className="proposal-stats">
            <div><Plus size={16} /><strong>{result.candidateEntities.length}</strong><span>новых карточек</span></div>
            <div><Network size={16} /><strong>{result.claims.length}</strong><span>предлагаемых связей</span></div>
            <div><ArrowUpRight size={16} /><strong>{result.sources.length}</strong><span>источников</span></div>
          </div>

          <div className="proposal-columns">
            <section>
              <h3>Новые сущности</h3>
              {result.candidateEntities.map((entity) => (
                <article className="proposal-card" key={entity.id}><span>{entity.type}</span><strong>{entity.title}</strong><p>{entity.summary}</p></article>
              ))}
              {result.candidateEntities.length === 0 && <p className="muted-copy">Новых сущностей не найдено.</p>}
            </section>
            <section>
              <h3>Предлагаемые связи</h3>
              {result.claims.map((claim) => (
                <article className="claim-card" key={claim.id}>
                  <div><i style={{ background: evidenceStyles[claim.status].color }} /><strong>{claim.predicate}</strong><span>{Math.round(claim.confidence * 100)}%</span></div>
                  <p>{claim.explanation}</p>
                </article>
              ))}
              {result.claims.length === 0 && <p className="muted-copy">Новых связей не предложено.</p>}
            </section>
          </div>

          {result.warnings.length > 0 && <div className="warning-box"><AlertTriangle size={17} /><div>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}

          <section className="source-list"><h3>Источники</h3>{result.sources.map((source) => (
            <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><div><strong>{source.title}</strong><span>{source.publisher} · {source.publishedAt || 'дата не указана'}</span></div><ArrowUpRight size={15} /></a>
          ))}</section>
        </div>
        <footer><button className="ghost-button" onClick={onClose}>Отклонить</button><button className="primary-button" onClick={onAccept}><Check size={16} />Принять предложения</button></footer>
      </section>
    </div>
  );
}
