import { useEffect, useMemo, useState } from 'react';
import { Bot, Plus, Search, ShieldCheck } from 'lucide-react';
import type {
  CaseFact,
  EntityType,
  HealthStatus,
  InvestigationCase,
  InvestigationEntity,
  InvestigationRelation,
  ResearchResult,
} from '../shared/domain';
import { api } from './lib/api';
import { mergeResearchResult } from './lib/graph';
import { AddEntityDialog } from './components/AddEntityDialog';
import { Board } from './components/Board';
import { Inspector } from './components/Inspector';
import { ResearchPanel } from './components/ResearchPanel';
import { Sidebar } from './components/Sidebar';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function App() {
  const [investigationCase, setInvestigationCase] = useState<InvestigationCase>();
  const [health, setHealth] = useState<HealthStatus>({ ok: false, aiConfigured: false, model: '—' });
  const [selectedEntityId, setSelectedEntityId] = useState<string>();
  const [selectedRelationId, setSelectedRelationId] = useState<string>();
  const [filter, setFilter] = useState<EntityType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [researchResult, setResearchResult] = useState<ResearchResult>();
  const [researching, setResearching] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    Promise.all([api.loadCase(), api.health()])
      .then(([loadedCase, healthStatus]) => {
        setInvestigationCase(loadedCase);
        setHealth(healthStatus);
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  const selectedEntity = useMemo(
    () => investigationCase?.entities.find((entity) => entity.id === selectedEntityId),
    [investigationCase, selectedEntityId],
  );
  const selectedRelation = useMemo(
    () => investigationCase?.relations.find((relation) => relation.id === selectedRelationId),
    [investigationCase, selectedRelationId],
  );

  function commit(update: (current: InvestigationCase) => InvestigationCase) {
    setInvestigationCase((current) => {
      if (!current) return current;
      const next = update(current);
      setSaveState('saving');
      void api.saveCase(next)
        .then((savedCase) => {
          setInvestigationCase((latest) => latest?.id === savedCase.id ? { ...latest, updatedAt: savedCase.updatedAt } : latest);
          setSaveState('saved');
        })
        .catch((error: Error) => {
          setSaveState('error');
          setMessage(error.message);
        });
      return next;
    });
  }

  function addEntity(input: { type: EntityType; title: string; subtitle: string; summary: string }) {
    const id = `${input.type}-${crypto.randomUUID().slice(0, 8)}`;
    const entity: InvestigationEntity = {
      id,
      ...input,
      position: { x: 240 + Math.random() * 460, y: 180 + Math.random() * 300 },
      facts: [],
    };
    commit((current) => ({ ...current, entities: [...current.entities, entity] }));
    setSelectedEntityId(id);
    setSelectedRelationId(undefined);
    setShowAddDialog(false);
  }

  function addFact(kind: CaseFact['kind'], text: string) {
    if (!selectedEntityId) return;
    const fact: CaseFact = {
      id: `fact-${crypto.randomUUID().slice(0, 8)}`,
      kind,
      text,
      status: kind === 'question' ? 'unknown' : 'user_asserted',
      confidence: kind === 'question' ? 0 : 0.5,
      sourceIds: [],
      createdBy: 'user',
    };
    commit((current) => ({
      ...current,
      entities: current.entities.map((entity) => entity.id === selectedEntityId ? { ...entity, facts: [...entity.facts, fact] } : entity),
    }));
  }

  function addRelation(targetId: string, label: string) {
    if (!selectedEntityId) return;
    const relation: InvestigationRelation = {
      id: `relation-${crypto.randomUUID().slice(0, 8)}`,
      sourceId: selectedEntityId,
      targetId,
      label,
      explanation: 'Связь добавлена пользователем и требует проверки источниками.',
      status: 'user_asserted',
      confidence: 0.5,
      sourceIds: [],
      createdBy: 'user',
    };
    commit((current) => ({ ...current, relations: [...current.relations, relation] }));
  }

  async function research(question: string) {
    if (!selectedEntityId) {
      setMessage('Сначала выберите карточку для исследования.');
      return;
    }
    setResearching(true);
    setMessage(undefined);
    try {
      setResearchResult(await api.research(selectedEntityId, question));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось выполнить исследование.');
    } finally {
      setResearching(false);
    }
  }

  function acceptResearch() {
    if (!researchResult || !selectedEntity || !investigationCase) return;
    const merged = mergeResearchResult(investigationCase, selectedEntity, researchResult);
    commit(() => merged);
    setResearchResult(undefined);
    setMessage(`Добавлено: ${researchResult.candidateEntities.length} карточек и ${researchResult.claims.length} связей.`);
  }

  if (!investigationCase) {
    return <div className="loading-screen"><span className="brand__mark">D</span><p>{message ?? 'Открываем материалы дела…'}</p></div>;
  }

  return (
    <main className="app-shell">
      <Sidebar investigationCase={investigationCase} filter={filter} onFilter={setFilter} />
      <section className="workspace">
        <header className="topbar">
          <label className="global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти на доске…" /></label>
          <div className="topbar__actions">
            <span className={`save-state save-state--${saveState}`}>{saveState === 'saving' ? 'Сохраняем…' : saveState === 'error' ? 'Ошибка сохранения' : 'Все изменения сохранены'}</span>
            <span className={`ai-status ${health.aiConfigured ? 'is-online' : ''}`} title={`Модель: ${health.model}`}><Bot size={14} />{health.aiConfigured ? 'AI подключён' : 'AI не настроен'}</span>
            <button className="secondary-button" onClick={() => setShowAddDialog(true)}><Plus size={16} />Карточка</button>
            <button className="primary-button topbar-research" disabled={!selectedEntity || researching || !health.aiConfigured} onClick={() => research('')}><ShieldCheck size={16} />{researching ? 'Исследуем…' : 'Найти связи'}</button>
          </div>
        </header>
        <Board
          investigationCase={investigationCase}
          selectedEntityId={selectedEntityId}
          filter={filter}
          search={search}
          onSelectEntity={(id) => { setSelectedEntityId(id); setSelectedRelationId(undefined); }}
          onSelectRelation={(relation) => { setSelectedRelationId(relation.id); setSelectedEntityId(undefined); }}
          onMoveEntity={(entityId, position) => commit((current) => ({
            ...current,
            entities: current.entities.map((entity) => entity.id === entityId ? { ...entity, position } : entity),
          }))}
        />
        {message && <button className="toast" onClick={() => setMessage(undefined)}>{message}<span>×</span></button>}
      </section>
      <Inspector
        entity={selectedEntity}
        relation={selectedRelation}
        allEntities={investigationCase.entities}
        sources={investigationCase.sources}
        aiConfigured={health.aiConfigured}
        researching={researching}
        onAddFact={addFact}
        onAddRelation={addRelation}
        onResearch={research}
      />
      {showAddDialog && <AddEntityDialog onClose={() => setShowAddDialog(false)} onAdd={addEntity} />}
      {researchResult && <ResearchPanel result={researchResult} onAccept={acceptResearch} onClose={() => setResearchResult(undefined)} />}
    </main>
  );
}
