import { useEffect, useMemo, useState } from 'react';
import { Bot, Plus, Search, ShieldCheck } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator, IconButton, Select } from '@operator-ui/framework';
import type {
  CaseSummary,
  CaseFact,
  CreateCaseInput,
  EntityType,
  HealthStatus,
  InvestigationCase,
  InvestigationEntity,
  InvestigationRelation,
  ResearchResult,
} from '../shared/domain';
import { entityTypes } from '../shared/domain';
import { api } from './lib/api';
import { mergeResearchResult, removeEntityFromCase } from './lib/graph';
import { AddEntityDialog } from './components/AddEntityDialog';
import { Board } from './components/Board';
import { CreateCaseDialog } from './components/CreateCaseDialog';
import { DeleteEntityDialog } from './components/DeleteEntityDialog';
import { EvidenceLegendControl } from './components/EvidenceLegendControl';
import { Inspector } from './components/Inspector';
import { LayerControl } from './components/LayerControl';
import { ResearchLivePanel } from './components/ResearchLivePanel';
import { SettingsPage } from './components/SettingsPage';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function App() {
  const [investigationCase, setInvestigationCase] = useState<InvestigationCase>();
  const [caseSummaries, setCaseSummaries] = useState<CaseSummary[]>([]);
  const [health, setHealth] = useState<HealthStatus>({
    ok: false,
    codex: { installed: false, authenticated: false, ready: false, path: '', version: '', authMessage: '', checkedAt: '' },
  });
  const [page, setPage] = useState<'board' | 'settings'>('board');
  const [selectedEntityId, setSelectedEntityId] = useState<string>();
  const [selectedRelationId, setSelectedRelationId] = useState<string>();
  const [visibleTypes, setVisibleTypes] = useState<Set<EntityType>>(() => new Set(entityTypes));
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCreateCaseDialog, setShowCreateCaseDialog] = useState(false);
  const [entityMenu, setEntityMenu] = useState<{ entityId: string; x: number; y: number }>();
  const [pendingDeleteEntityId, setPendingDeleteEntityId] = useState<string>();
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
    Promise.all([api.listCases(), api.health()])
      .then(async ([summaries, healthStatus]) => {
        const loadedCase = await api.loadCase(summaries[0].id);
        setCaseSummaries(summaries);
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
          setCaseSummaries((summaries) => summaries.map((summary) => summary.id === savedCase.id ? {
            ...summary,
            updatedAt: savedCase.updatedAt,
            entityCount: savedCase.entities.length,
            relationCount: savedCase.relations.length,
          } : summary));
          setSaveState('saved');
        })
        .catch((error: Error) => {
          setSaveState('error');
          setMessage(error.message);
        });
      return next;
    });
  }

  async function openCase(caseId: string) {
    if (researching) return;
    try {
      const loadedCase = await api.loadCase(caseId);
      setInvestigationCase(loadedCase);
      setSelectedEntityId(undefined);
      setSelectedRelationId(undefined);
      setPreviewCase(undefined);
      setResearchResult(undefined);
      setPage('board');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось открыть дело.');
    }
  }

  async function createCase(input: CreateCaseInput) {
    try {
      const createdCase = await api.createCase(input);
      setCaseSummaries(await api.listCases());
      setInvestigationCase(createdCase);
      setSelectedEntityId(createdCase.entities[0]?.id);
      setSelectedRelationId(undefined);
      setShowCreateCaseDialog(false);
      setPage('board');
      setMessage(`${createdCase.title} создано.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось создать дело.');
    }
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

  async function research(question: string, focusEntityId = selectedEntityId) {
    const focusEntity = investigationCase?.entities.find((entity) => entity.id === focusEntityId);
    if (!focusEntityId || !focusEntity || !investigationCase) {
      setMessage('Сначала выберите карточку для исследования.');
      return;
    }
    if (!health.codex.ready) {
      setPage('settings');
      setMessage('Codex CLI не готов. Проверьте установку и авторизацию в настройках.');
      return;
    }
    setSelectedEntityId(focusEntityId);
    setSelectedRelationId(undefined);
    setResearching(true);
    setResearchResult(undefined);
    setPreviewCase(investigationCase);
    setResearchLogs(['Подготавливаю контекст выбранной карточки.']);
    setVisibleResearchEntities(0);
    setVisibleResearchRelations(0);
    setMessage(undefined);
    try {
      let streamedResult: ResearchResult | undefined;
      await api.researchStream(investigationCase.id, focusEntityId, question, (event) => {
        if (event.type === 'status') {
          setResearchLogs((current) => current.at(-1) === event.message ? current : [...current, event.message].slice(-9));
        }
        if (event.type === 'result') streamedResult = event.result;
      });
      if (!streamedResult) throw new Error('Codex завершил работу без графа предложений.');

      const targetCase = mergeResearchResult(investigationCase, focusEntity, streamedResult);
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

  function deleteEntity(entityId: string) {
    if (!investigationCase) return;
    const entity = investigationCase.entities.find((item) => item.id === entityId);
    if (!entity) return;
    const relationCount = investigationCase.relations.filter((relation) => relation.sourceId === entityId || relation.targetId === entityId).length;
    commit((current) => removeEntityFromCase(current, entityId));
    setSelectedEntityId(undefined);
    setSelectedRelationId(undefined);
    setPendingDeleteEntityId(undefined);
    setEntityMenu(undefined);
    setMessage(`Карточка «${entity.title}» и ${relationCount} связ. удалены.`);
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
  const inspectorVisible = page === 'board' && Boolean(selectedEntity || selectedRelation);
  const pendingDeleteEntity = investigationCase.entities.find((entity) => entity.id === pendingDeleteEntityId);
  const pendingDeleteRelationCount = pendingDeleteEntityId
    ? investigationCase.relations.filter((relation) => relation.sourceId === pendingDeleteEntityId || relation.targetId === pendingDeleteEntityId).length
    : 0;

  function toggleLayer(type: EntityType) {
    setVisibleTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <main className={`app-shell ${inspectorVisible ? 'has-inspector' : ''}`} data-theme="dark">
      {page === 'settings' ? (
        <SettingsPage health={health} refreshing={refreshingCodex} onRefresh={refreshCodexStatus} onOpenBoard={() => setPage('board')} />
      ) : <>
      <section className="workspace">
        <header className="topbar">
          <div className="compact-case-switcher">
            <span className="brand__mark">D</span>
            <Select className="case-select" value={investigationCase.id} disabled={researching} onChange={(event) => openCase(event.target.value)} aria-label="Текущее дело">
              {caseSummaries.map((summary) => <option key={summary.id} value={summary.id}>{summary.title}</option>)}
            </Select>
            <IconButton icon="add" label="Создать новое дело" onClick={() => setShowCreateCaseDialog(true)} />
          </div>
          <label className="global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти на доске…" /></label>
          <div className="topbar__actions">
            <span className={`save-state save-state--${saveState}`}>{saveState === 'saving' ? 'Сохраняем…' : saveState === 'error' ? 'Ошибка сохранения' : 'Все изменения сохранены'}</span>
            <span className={`ai-status ${health.codex.ready ? 'is-online' : ''}`} title={health.codex.path}><Bot size={14} />{health.codex.ready ? 'Codex готов' : 'Ручной режим'}</span>
            <button className="secondary-button" onClick={() => setShowAddDialog(true)}><Plus size={16} />Карточка</button>
            <button className="primary-button topbar-research" disabled={!selectedEntity || researching || !health.codex.ready} onClick={() => research('')}><ShieldCheck size={16} />{researching ? 'Исследуем…' : 'Найти связи'}</button>
            <IconButton icon="settings" label="Настройки" onClick={() => setPage('settings')} />
          </div>
        </header>
        <Board
          investigationCase={displayedCase}
          selectedEntityId={selectedEntityId}
          visibleTypes={visibleTypes}
          search={search}
          onSelectEntity={(id) => { setSelectedEntityId(id); setSelectedRelationId(undefined); }}
          onOpenEntityMenu={(entityId, position) => setEntityMenu({ entityId, ...position })}
          onSelectRelation={(relation) => { setSelectedRelationId(relation.id); setSelectedEntityId(undefined); }}
          onMoveEntity={(entityId, position) => commit((current) => ({
            ...current,
            entities: current.entities.map((entity) => entity.id === entityId ? { ...entity, position } : entity),
          }))}
        />
        <LayerControl investigationCase={displayedCase} visibleTypes={visibleTypes} onToggle={toggleLayer} onShowAll={() => setVisibleTypes(new Set(entityTypes))} />
        <EvidenceLegendControl />
        {(researching || previewCase) && <ResearchLivePanel logs={researchLogs} researching={researching} result={researchResult} visibleEntities={visibleResearchEntities} visibleRelations={visibleResearchRelations} onAccept={acceptResearch} onReject={rejectResearch} />}
        {message && <button className="toast" onClick={() => setMessage(undefined)}>{message}<span>×</span></button>}
      </section>
      {inspectorVisible && <Inspector
        entity={selectedEntity}
        relation={selectedRelation}
        allEntities={displayedCase.entities}
        sources={displayedCase.sources}
        aiConfigured={health.codex.ready}
        researching={researching}
        onAddFact={addFact}
        onAddRelation={addRelation}
        onResearch={research}
        onClose={() => { setSelectedEntityId(undefined); setSelectedRelationId(undefined); }}
      />}
      </>}
      {showAddDialog && <AddEntityDialog onClose={() => setShowAddDialog(false)} onAdd={addEntity} />}
      <CreateCaseDialog
        open={showCreateCaseDialog}
        nextCaseNumber={Math.max(0, ...caseSummaries.map((summary) => summary.caseNumber)) + 1}
        onClose={() => setShowCreateCaseDialog(false)}
        onCreate={createCase}
      />
      <ContextMenu open={Boolean(entityMenu)} x={entityMenu?.x ?? 0} y={entityMenu?.y ?? 0} onClose={() => setEntityMenu(undefined)}>
        <ContextMenuItem onClick={() => setEntityMenu(undefined)}>Открыть карточку</ContextMenuItem>
        <ContextMenuItem
          disabled={!health.codex.ready || researching}
          onClick={() => {
            const entityId = entityMenu?.entityId;
            setEntityMenu(undefined);
            if (entityId) void research('', entityId);
          }}
        >
          Доисследовать через Codex
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={researching}
          onClick={() => {
            setPendingDeleteEntityId(entityMenu?.entityId);
            setEntityMenu(undefined);
          }}
        >
          Удалить карточку и связи…
        </ContextMenuItem>
      </ContextMenu>
      <DeleteEntityDialog
        entityTitle={pendingDeleteEntity?.title}
        relationCount={pendingDeleteRelationCount}
        onClose={() => setPendingDeleteEntityId(undefined)}
        onConfirm={() => pendingDeleteEntityId && deleteEntity(pendingDeleteEntityId)}
      />
    </main>
  );
}
