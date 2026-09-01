import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ContactRound, Plus, Search, ShieldCheck } from 'lucide-react';
import { Button, ContextMenu, ContextMenuItem, ContextMenuSeparator, frameworkPersistence, IconButton, Select } from '@operator-ui/framework';
import type {
  CaseSummary,
  CaseFact,
  CreateCaseInput,
  EntityResearchState,
  EntityType,
  GoogleContact,
  GoogleIntegrationStatus,
  HealthStatus,
  InvestigationCase,
  InvestigationEntity,
  InvestigationRelation,
  ResearchStreamEvent,
} from '../shared/domain';
import { entityTypes } from '../shared/domain';
import { getDefaultSubjectEntityId, getResearchSubjectEntity, getResearchSubjectEntityId, resetResearchSubject, setResearchSubject } from '../shared/caseSubject';
import { api } from './lib/api';
import { isEntityVisible, mergeResearchResultWithOutcome, removeEntityFromCase } from './lib/graph';
import { importGoogleContact as mergeGoogleContact } from './lib/googleContactImport';
import { arrangeInvestigationGraph } from './lib/treeGraphLayout';
import { getEntityProvenance } from './lib/entityProvenance';
import { AddEntityDialog } from './components/AddEntityDialog';
import { Board } from './components/Board';
import { CreateCaseDialog } from './components/CreateCaseDialog';
import { DeleteEntityDialog } from './components/DeleteEntityDialog';
import { EvidenceLegendControl } from './components/EvidenceLegendControl';
import { Inspector } from './components/Inspector';
import { LayerControl } from './components/LayerControl';
import { SettingsPage } from './components/SettingsPage';
import { GoogleContactsDialog } from './components/GoogleContactsDialog';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function App() {
  const [investigationCase, setInvestigationCase] = useState<InvestigationCase>();
  const [caseSummaries, setCaseSummaries] = useState<CaseSummary[]>([]);
  const [health, setHealth] = useState<HealthStatus>({
    ok: false,
    codex: { installed: false, authenticated: false, ready: false, path: '', version: '', authMessage: '', checkedAt: '' },
  });
  const [googleStatus, setGoogleStatus] = useState<GoogleIntegrationStatus>({ configured: false, connected: false, scope: '', message: 'Проверяем интеграцию…' });
  const [page, setPage] = useState<'board' | 'settings'>(() => new URLSearchParams(window.location.search).has('google') ? 'settings' : 'board');
  const [selectedEntityId, setSelectedEntityId] = useState<string>();
  const [selectedRelationId, setSelectedRelationId] = useState<string>();
  const [visibleTypes, setVisibleTypes] = useState<Set<EntityType>>(() => new Set(entityTypes));
  const [search, setSearch] = useState('');
  const [autoFitResearch, setAutoFitResearch] = useState(() => frameworkPersistence.get<boolean>('detective:auto-fit-research', true, (value): value is boolean => typeof value === 'boolean'));
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCreateCaseDialog, setShowCreateCaseDialog] = useState(false);
  const [showGoogleContacts, setShowGoogleContacts] = useState(false);
  const [entityMenu, setEntityMenu] = useState<{ entityId: string; x: number; y: number }>();
  const [pendingDeleteEntityId, setPendingDeleteEntityId] = useState<string>();
  const [researchByEntityId, setResearchByEntityId] = useState<Record<string, EntityResearchState>>({});
  const [refreshingCodex, setRefreshingCodex] = useState(false);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  const [revealEntityRequest, setRevealEntityRequest] = useState<{ entityId: string; key: number }>();
  const [fitGraphRequestKey, setFitGraphRequestKey] = useState<number>();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string>();
  const investigationCaseRef = useRef<InvestigationCase | undefined>(undefined);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const researching = Object.values(researchByEntityId).some((research) => research.status === 'running');

  useEffect(() => {
    frameworkPersistence.set('detective:auto-fit-research', autoFitResearch);
  }, [autoFitResearch]);

  useEffect(() => {
    investigationCaseRef.current = investigationCase;
  }, [investigationCase]);

  useEffect(() => {
    Promise.all([api.listCases(), api.health(), api.googleStatus()])
      .then(async ([summaries, healthStatus, currentGoogleStatus]) => {
        const loadedCase = await api.loadCase(summaries[0].id);
        setCaseSummaries(summaries);
        setInvestigationCase(loadedCase);
        setHealth(healthStatus);
        setGoogleStatus(currentGoogleStatus);
        if (!healthStatus.codex.ready) setPage('settings');
      })
      .catch((error: Error) => setMessage(error.message));

    const googleResult = new URLSearchParams(window.location.search).get('google');
    if (googleResult) {
      setMessage(googleResult === 'connected' ? 'Google Контакты подключены.' : 'Не удалось подключить Google Контакты. Повторите попытку.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const selectedEntity = useMemo(
    () => investigationCase?.entities.find((entity) => entity.id === selectedEntityId),
    [investigationCase, selectedEntityId],
  );
  const selectedRelation = useMemo(
    () => investigationCase?.relations.find((relation) => relation.id === selectedRelationId),
    [investigationCase, selectedRelationId],
  );

  useEffect(() => {
    if (!selectedEntity || isEntityVisible(selectedEntity, visibleTypes, search)) return;
    setSelectedEntityId(undefined);
    setSelectedRelationId(undefined);
  }, [search, selectedEntity, visibleTypes]);

  useEffect(() => {
    const closeInspectorOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || page !== 'board') return;
      setSelectedEntityId(undefined);
      setSelectedRelationId(undefined);
    };
    window.addEventListener('keydown', closeInspectorOnEscape);
    return () => window.removeEventListener('keydown', closeInspectorOnEscape);
  }, [page]);

  function commit(update: (current: InvestigationCase) => InvestigationCase) {
    const current = investigationCaseRef.current;
    if (!current) return;
    const next = update(current);
    investigationCaseRef.current = next;
    setInvestigationCase(next);
    setSaveState('saving');
    saveQueue.current = saveQueue.current.catch(() => undefined).then(() => api.saveCase(next))
      .then((savedCase) => {
        if (investigationCaseRef.current?.id === savedCase.id) {
          investigationCaseRef.current = { ...investigationCaseRef.current, updatedAt: savedCase.updatedAt };
          setInvestigationCase(investigationCaseRef.current);
        }
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
  }

  async function openCase(caseId: string) {
    if (researching) return;
    try {
      const loadedCase = await api.loadCase(caseId);
      setInvestigationCase(loadedCase);
      setSelectedEntityId(undefined);
      setSelectedRelationId(undefined);
      setResearchByEntityId({});
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
      sourceIds: [],
      createdBy: 'user',
    };
    commit((current) => ({ ...current, entities: [...current.entities, entity] }));
    setSelectedEntityId(id);
    setSelectedRelationId(undefined);
    setShowAddDialog(false);
  }

  function addGoogleContact(contact: GoogleContact) {
    if (!investigationCase) return;
    const result = mergeGoogleContact(investigationCase, contact);
    if (result.created) commit(() => result.investigationCase);
    setSelectedEntityId(result.entityId);
    setSelectedRelationId(undefined);
    setRevealEntityRequest({ entityId: result.entityId, key: Date.now() });
    setMessage(result.created ? `Контакт «${contact.displayName}» добавлен на доску.` : `Контакт «${contact.displayName}» уже есть на доске.`);
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

  async function research(question: string, focusEntityId = selectedEntityId, file?: File) {
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
    if (researchByEntityId[focusEntityId]?.status === 'running') {
      setMessage(`Исследование карточки «${focusEntity.title}» уже выполняется.`);
      return;
    }
    const researchSubject = getResearchSubjectEntity(investigationCase) ?? focusEntity;
    const relationshipContext = researchSubject.id === focusEntity.id ? '' : ` в отношении объекта «${researchSubject.title}»`;
    const normalizedQuestion = question.trim() || (file
      ? `Извлеки из документа факты, сущности, связи и вопросы по выбранной карточке${relationshipContext}.`
      : `Найди и проверь связи выбранной карточки${relationshipContext}.`);
    const initialResearch: EntityResearchState = {
      entityId: focusEntityId, status: 'running', stage: 'starting', message: file ? `Загружаю файл «${file.name}»${relationshipContext}.` : `Подготавливаю поиск${relationshipContext}.`, question: normalizedQuestion, startedAt: new Date().toISOString(), source: file ? 'file' : 'web', fileName: file?.name,
    };
    setSelectedEntityId(focusEntityId);
    setSelectedRelationId(undefined);
    setResearchByEntityId((current) => ({ ...current, [focusEntityId]: initialResearch }));
    setMessage(undefined);
    try {
      let streamedResult: EntityResearchState['result'];
      const onEvent = (event: ResearchStreamEvent) => {
        if (event.type === 'status') {
          setResearchByEntityId((current) => ({ ...current, [focusEntityId]: { ...(current[focusEntityId] ?? initialResearch), stage: event.stage, message: event.message } }));
        }
        if (event.type === 'result') streamedResult = event.result;
      };
      if (file) await api.researchFileStream(investigationCase.id, focusEntityId, normalizedQuestion, file, onEvent);
      else await api.researchStream(investigationCase.id, focusEntityId, normalizedQuestion, onEvent);
      if (!streamedResult) throw new Error('Codex завершил работу без графа предложений.');
      const latestCase = investigationCaseRef.current ?? investigationCase;
      const currentFocus = latestCase.entities.find((entity) => entity.id === focusEntityId) ?? focusEntity;
      const outcome = mergeResearchResultWithOutcome(latestCase, currentFocus, streamedResult);
      if (outcome.hasNewInformation) commit(() => outcome.investigationCase);
      setResearchByEntityId((current) => ({ ...current, [focusEntityId]: {
        ...(current[focusEntityId] ?? initialResearch), status: 'completed', stage: 'completed',
        message: outcome.hasNewInformation
          ? `Добавлено: ${outcome.addedEntityCount} карточек, ${outcome.addedRelationCount} связей, ${outcome.addedSourceCount} источников, ${outcome.addedQuestionCount} вопросов${outcome.updatedRelationCount ? `; обновлено связей: ${outcome.updatedRelationCount}` : ''}.`
          : 'Новых сведений и связей не найдено.',
        result: outcome.result,
      } }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Не удалось выполнить исследование.';
      setResearchByEntityId((current) => ({ ...current, [focusEntityId]: { ...(current[focusEntityId] ?? initialResearch), status: 'error', stage: 'error', message: errorMessage } }));
      setMessage(errorMessage);
    }
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

  function arrangeObjects() {
    if (!investigationCase || investigationCase.entities.length === 0 || researching) return;
    commit((current) => arrangeInvestigationGraph(current, selectedEntityId));
    setFitGraphRequestKey((current) => (current ?? 0) + 1);
    setMessage(selectedEntity
      ? `Граф расставлен деревом от карточки «${selectedEntity.title}».`
      : 'Объекты расставлены как связные деревья.');
  }

  function chooseResearchSubject(entityId: string) {
    const entity = investigationCase?.entities.find((item) => item.id === entityId);
    if (!entity || researching) return;
    commit((current) => setResearchSubject(current, entityId));
    setEntityMenu(undefined);
    setMessage(`«${entity.title}» установлен как исследуемый объект дела.`);
  }

  function restoreDefaultResearchSubject() {
    if (!investigationCase || researching) return;
    const defaultEntityId = getDefaultSubjectEntityId(investigationCase);
    const defaultEntity = investigationCase.entities.find((entity) => entity.id === defaultEntityId);
    commit(resetResearchSubject);
    setEntityMenu(undefined);
    if (defaultEntity) setMessage(`Исследуемый объект возвращён к исходной карточке «${defaultEntity.title}».`);
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

  async function disconnectGoogle() {
    setDisconnectingGoogle(true);
    try {
      setGoogleStatus(await api.disconnectGoogle());
      setShowGoogleContacts(false);
      setMessage('Google Контакты отключены. Уже импортированные карточки сохранены в деле.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось отключить Google Контакты.');
    } finally {
      setDisconnectingGoogle(false);
    }
  }

  if (!investigationCase) {
    return <div className="loading-screen"><span className="brand__mark">D</span><p>{message ?? 'Открываем материалы дела…'}</p></div>;
  }
  const displayedCase = investigationCase;
  const defaultSubjectEntityId = getDefaultSubjectEntityId(investigationCase);
  const researchSubjectEntityId = getResearchSubjectEntityId(investigationCase);
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
        <SettingsPage health={health} refreshing={refreshingCodex} autoFitResearch={autoFitResearch} onAutoFitResearchChange={setAutoFitResearch} googleStatus={googleStatus} disconnectingGoogle={disconnectingGoogle} onDisconnectGoogle={disconnectGoogle} onRefresh={refreshCodexStatus} onOpenBoard={() => setPage('board')} />
      ) : <>
      <section className="workspace">
        <header className="topbar">
          <div className="compact-case-switcher">
            <span className="brand__mark">D</span>
            <Select className="case-select" value={investigationCase.id} disabled={researching} onChange={(event) => openCase(event.target.value)} aria-label="Текущее дело">
              {caseSummaries.map((summary) => <option key={summary.id} value={summary.id}>{summary.title}</option>)}
            </Select>
            <IconButton icon="add" label="Создать новое дело" disabled={researching} onClick={() => setShowCreateCaseDialog(true)} />
          </div>
          <label className="global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти на доске…" /></label>
          <div className="topbar__actions">
            <span className={`save-state save-state--${saveState}`}>{saveState === 'saving' ? 'Сохраняем…' : saveState === 'error' ? 'Ошибка сохранения' : 'Все изменения сохранены'}</span>
            <span className={`ai-status ${health.codex.ready ? 'is-online' : ''}`} title={health.codex.path}><Bot size={14} />{researching ? `${Object.values(researchByEntityId).filter((item) => item.status === 'running').length} в работе` : health.codex.ready ? 'Codex готов' : 'Ручной режим'}</span>
            <button className="secondary-button" onClick={() => {
              if (googleStatus.connected) setShowGoogleContacts(true);
              else { setPage('settings'); setMessage(googleStatus.configured ? 'Сначала подключите аккаунт Google.' : 'Сначала настройте OAuth-клиент Google.'); }
            }}><ContactRound size={16} />Контакты</button>
            <button className="secondary-button" onClick={() => setShowAddDialog(true)}><Plus size={16} />Карточка</button>
            <Button className="arrange-button" icon="network" disabled={researching || investigationCase.entities.length === 0} onClick={arrangeObjects}>Расставить</Button>
            <button className="primary-button topbar-research" disabled={!selectedEntity || !health.codex.ready || Boolean(selectedEntity && researchByEntityId[selectedEntity.id]?.status === 'running')} onClick={() => research('')}><ShieldCheck size={16} />{selectedEntity && researchByEntityId[selectedEntity.id]?.status === 'running' ? 'В работе…' : 'Найти связи'}</button>
            <IconButton icon="settings" label="Настройки" onClick={() => setPage('settings')} />
          </div>
        </header>
        <Board
          investigationCase={displayedCase}
          selectedEntityId={selectedEntityId}
          visibleTypes={visibleTypes}
          search={search}
          researchByEntityId={researchByEntityId}
          autoFitResearch={autoFitResearch}
          researching={researching}
          revealEntityRequest={revealEntityRequest}
          fitGraphRequestKey={fitGraphRequestKey}
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
        {message && <button className="toast" onClick={() => setMessage(undefined)}>{message}<span>×</span></button>}
      </section>
      {inspectorVisible && <Inspector
        entity={selectedEntity}
        relation={selectedRelation}
        allEntities={displayedCase.entities}
        sources={displayedCase.sources}
        aiConfigured={health.codex.ready}
        research={selectedEntity ? researchByEntityId[selectedEntity.id] : undefined}
        researchSubject={getResearchSubjectEntity(displayedCase)}
        provenance={selectedEntity ? getEntityProvenance(displayedCase, selectedEntity) : undefined}
        onAddFact={addFact}
        onAddRelation={addRelation}
        onResearch={(question, file) => research(question, selectedEntityId, file)}
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
      <GoogleContactsDialog open={showGoogleContacts} onClose={() => setShowGoogleContacts(false)} onImport={addGoogleContact} />
      <ContextMenu open={Boolean(entityMenu)} x={entityMenu?.x ?? 0} y={entityMenu?.y ?? 0} onClose={() => setEntityMenu(undefined)}>
        <ContextMenuItem onClick={() => setEntityMenu(undefined)}>Открыть карточку</ContextMenuItem>
        {entityMenu && entityMenu.entityId !== researchSubjectEntityId && <ContextMenuItem disabled={researching} onClick={() => chooseResearchSubject(entityMenu.entityId)}>
          Установить как исследуемый объект
        </ContextMenuItem>}
        {researchSubjectEntityId !== defaultSubjectEntityId && <ContextMenuItem disabled={researching} onClick={restoreDefaultResearchSubject}>
          Вернуть исходный объект
        </ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!health.codex.ready || Boolean(entityMenu && researchByEntityId[entityMenu.entityId]?.status === 'running')}
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
