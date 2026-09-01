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
import { ResearchLivePanel } from './components/ResearchLivePanel';
import { SettingsPage } from './components/SettingsPage';
import { Sidebar } from './components/Sidebar';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function App() {
  const [investigationCase, setInvestigationCase] = useState<InvestigationCase>();
  const [health, setHealth] = useState<HealthStatus>({
    ok: false,
    codex: { installed: false, authenticated: false, ready: false, path: '', version: '', authMessage: '', checkedAt: '' },
  });
  const [page, setPage] = useState<'board' | 'settings'>('board');
  const [selectedEntityId, setSelectedEntityId] = useState<string>();
  const [selectedRelationId, setSelectedRelationId] = useState<string>();
  const [filter, setFilter] = useState<EntityType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [researchResult, setResearchResult] = useState<ResearchResult>();
  const [previewCase, setPreviewCase] = useState<InvestigationCase>();
  const [researchLogs, setResearchLogs] = useState<string[]>([]);
  const [visibleResearchEntities, setVisibleResearchEntities] = useState(0);
  const [visibleResearchRelations, setVisibleResearchRelations] = useState(0);
  const [researching, setResearching] = useState(false);
  const [refreshingCodex, setRefreshingCodex] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    Promise.all([api.loadCase(), api.health()])
      .then(([loadedCase, healthStatus]) => {
        setInvestigationCase(loadedCase);
        setHealth(healthStatus);
        if (!healthStatus.codex.ready) setPage('settings');
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  const selectedEntity = useMemo(
    () => (previewCase ?? investigationCase)?.entities.find((entity) => entity.id === selectedEntityId),
    [investigationCase, previewCase, selectedEntityId],
  );
  const selectedRelation = useMemo(
    () => (previewCase ?? investigationCase)?.relations.find((relation) => relation.id === selectedRelationId),
    [investigationCase, previewCase, selectedRelationId],
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
    if (!selectedEntityId || !selectedEntity || !investigationCase) {
      setMessage('Сначала выберите карточку для исследования.');
      return;
    }
    if (!health.codex.ready) {
      setPage('settings');
      setMessage('Codex CLI не готов. Проверьте установку и авторизацию в настройках.');
      return;
    }
    setResearching(true);
    setResearchResult(undefined);
    setPreviewCase(investigationCase);
    setResearchLogs(['Подготавливаю контекст выбранной карточки.']);
    setVisibleResearchEntities(0);
    setVisibleResearchRelations(0);
    setMessage(undefined);
    try {
      let streamedResult: ResearchResult | undefined;
      await api.researchStream(selectedEntityId, question, (event) => {
        if (event.type === 'status') {
          setResearchLogs((current) => current.at(-1) === event.message ? current : [...current, event.message].slice(-9));
        }
        if (event.type === 'result') streamedResult = event.result;
      });
      if (!streamedResult) throw new Error('Codex завершил работу без графа предложений.');

      const targetCase = mergeResearchResult(investigationCase, selectedEntity, streamedResult);
      const newEntities = targetCase.entities.filter((entity) => !investigationCase.entities.some((current) => current.id === entity.id));
      const newRelations = targetCase.relations.filter((relation) => !investigationCase.relations.some((current) => current.id === relation.id));
      let animatedCase: InvestigationCase = { ...investigationCase, sources: targetCase.sources };

      setResearchLogs((current) => [...current, 'Добавляю найденные сущности на доску.'].slice(-9));
      for (const entity of newEntities) {
        animatedCase = { ...animatedCase, entities: [...animatedCase.entities, entity] };
        setPreviewCase(animatedCase);
        setVisibleResearchEntities((count) => count + 1);
        await new Promise((resolve) => window.setTimeout(resolve, 420));
      }

      setResearchLogs((current) => [...current, 'Строю проверяемые связи между карточками.'].slice(-9));
      for (const relation of newRelations) {
        animatedCase = { ...animatedCase, relations: [...animatedCase.relations, relation] };
        setPreviewCase(animatedCase);
        setVisibleResearchRelations((count) => count + 1);
        await new Promise((resolve) => window.setTimeout(resolve, 360));
      }
      setPreviewCase(animatedCase);
      setResearchResult(streamedResult);
      setResearchLogs((current) => [...current, 'Граф готов. Проверьте результат перед сохранением.'].slice(-9));
    } catch (error) {
      setPreviewCase(undefined);
      setMessage(error instanceof Error ? error.message : 'Не удалось выполнить исследование.');
    } finally {
      setResearching(false);
    }
  }

  function acceptResearch() {
    if (!researchResult || !previewCase) return;
    commit(() => previewCase);
    setPreviewCase(undefined);
    setResearchResult(undefined);
    setResearchLogs([]);
    setMessage(`Сохранено: ${visibleResearchEntities} карточек и ${visibleResearchRelations} связей.`);
  }

  function rejectResearch() {
    setPreviewCase(undefined);
    setResearchResult(undefined);
    setResearchLogs([]);
    setVisibleResearchEntities(0);
    setVisibleResearchRelations(0);
    setMessage('Предложения Codex удалены, исходная доска не изменилась.');
  }

  async function refreshCodexStatus() {
    setRefreshingCodex(true);
    try {
      setHealth(await api.refreshCodexStatus());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось проверить Codex CLI.');
    } finally {
      setRefreshingCodex(false);
    }
  }

  if (!investigationCase) {
    return <div className="loading-screen"><span className="brand__mark">D</span><p>{message ?? 'Открываем материалы дела…'}</p></div>;
  }
  const displayedCase = previewCase ?? investigationCase;

  return (
    <main className="app-shell">
      <Sidebar investigationCase={investigationCase} filter={filter} onFilter={setFilter} page={page} codexReady={health.codex.ready} onOpenSettings={() => setPage('settings')} onOpenBoard={() => setPage('board')} />
      {page === 'settings' ? (
        <SettingsPage health={health} refreshing={refreshingCodex} onRefresh={refreshCodexStatus} onOpenBoard={() => setPage('board')} />
      ) : <>
      <section className="workspace">
        <header className="topbar">
          <label className="global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти на доске…" /></label>
          <div className="topbar__actions">
            <span className={`save-state save-state--${saveState}`}>{saveState === 'saving' ? 'Сохраняем…' : saveState === 'error' ? 'Ошибка сохранения' : 'Все изменения сохранены'}</span>
            <span className={`ai-status ${health.codex.ready ? 'is-online' : ''}`} title={health.codex.path}><Bot size={14} />{health.codex.ready ? 'Codex готов' : 'Ручной режим'}</span>
            <button className="secondary-button" onClick={() => setShowAddDialog(true)}><Plus size={16} />Карточка</button>
            <button className="primary-button topbar-research" disabled={!selectedEntity || researching || !health.codex.ready} onClick={() => research('')}><ShieldCheck size={16} />{researching ? 'Исследуем…' : 'Найти связи'}</button>
          </div>
        </header>
        <Board
          investigationCase={displayedCase}
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
        {(researching || previewCase) && <ResearchLivePanel logs={researchLogs} researching={researching} result={researchResult} visibleEntities={visibleResearchEntities} visibleRelations={visibleResearchRelations} onAccept={acceptResearch} onReject={rejectResearch} />}
        {message && <button className="toast" onClick={() => setMessage(undefined)}>{message}<span>×</span></button>}
      </section>
      <Inspector
        entity={selectedEntity}
        relation={selectedRelation}
        allEntities={displayedCase.entities}
        sources={displayedCase.sources}
        aiConfigured={health.codex.ready}
        researching={researching}
        onAddFact={addFact}
        onAddRelation={addRelation}
        onResearch={research}
      />
      </>}
      {showAddDialog && <AddEntityDialog onClose={() => setShowAddDialog(false)} onAdd={addEntity} />}
    </main>
  );
}
