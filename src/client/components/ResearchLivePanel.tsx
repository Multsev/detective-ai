import { Check, LoaderCircle, Network, Radar, RotateCcw, ShieldCheck } from 'lucide-react';
import type { ResearchResult } from '../../shared/domain';

interface ResearchLivePanelProps {
  logs: string[];
  researching: boolean;
  result?: ResearchResult;
  visibleEntities: number;
  visibleRelations: number;
  onAccept: () => void;
  onReject: () => void;
}

export function ResearchLivePanel({ logs, researching, result, visibleEntities, visibleRelations, onAccept, onReject }: ResearchLivePanelProps) {
  return (
    <aside className="live-panel">
      <header>
        <div className={`live-pulse ${researching ? 'is-active' : ''}`}><Radar size={17} /></div>
        <div><span className="inspector__eyebrow">Поток Codex CLI</span><h2>{researching ? 'Исследование выполняется' : 'Граф построен'}</h2></div>
      </header>

      <div className="live-counters">
        <div><strong>{visibleEntities}</strong><span>карточек появилось</span></div>
        <div><strong>{visibleRelations}</strong><span>связей построено</span></div>
      </div>

      <div className="live-log">
        {logs.map((log, index) => <div className={index === logs.length - 1 ? 'current' : ''} key={`${index}-${log}`}>{index === logs.length - 1 && researching ? <LoaderCircle size={12} className="spin" /> : <Check size={12} />}<span>{log}</span></div>)}
      </div>

      {result && <div className="live-result">
        <div><ShieldCheck size={16} /><strong>Оценка идентичности</strong></div>
        <p>{result.identityAssessment}</p>
        <p>{result.summary}</p>
        {result.warnings.map((warning) => <small key={warning}>{warning}</small>)}
      </div>}

      {!researching && result && <footer>
        <button className="ghost-button" onClick={onReject}><RotateCcw size={14} />Отклонить</button>
        <button className="primary-button" onClick={onAccept}><Network size={14} />Сохранить на доске</button>
      </footer>}
    </aside>
  );
}
