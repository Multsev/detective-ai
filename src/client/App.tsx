import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ContactRound, Plus, Search, Share2, ShieldCheck } from 'lucide-react';
import { Button, ContextMenu, ContextMenuItem, ContextMenuSeparator, frameworkPersistence, IconButton, Select } from '@operator-ui/framework';
import type {
  CaseSummary,
  CreateCaseInput,
  EntityResearchState,
  EntityAttributeKind,
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
import { attributeIdentityKey } from '../shared/entityAttributeCatalog';
import { getDefaultSubjectEntityId, getResearchSubjectEntityId, resetResearchSubject, setResearchSubject } from '../shared/caseSubject';
import { api } from './lib/api';
import { connectEntities, isEntityVisible, mergeResearchResultWithOutcome, removeEntityFromCase } from './lib/graph';
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
import { FindRelationshipsDialog } from './components/FindRelationshipsDialog';

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
  const [showFindRelationships, setShowFindRelationships] = useState(false);
  const [relationshipInitialEntityIds, setRelationshipInitialEntityIds] = useState<string[]>([]);
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
  const runningResearchCount = new Set(Object.values(researchByEntityId).filter((research) => research.status === 'running').map((research) => research.startedAt)).size;
  const runningEntityIds = useMemo(() => new Set(Object.values(researchByEntityId).filter((research) => research.status === 'running').map((research) => research.entityId)), [researchByEntityId]);

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
      attributes: [],
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

  function addAttribute(input: { key: string; label: string; value: string; kind: EntityAttributeKind }) {
    if (!selectedEntityId) return;
    const value = input.value.trim();
    if (!value) return;
    commit((current) => ({
      ...current,
      entities: current.entities.map((entity) => entity.id === selectedEntityId ? {
        ...entity,
        attributes: (entity.attributes ?? []).some((attribute) => attributeIdentityKey(attribute) === attributeIdentityKey({ ...input, value }))
          ? entity.attributes
          : [...(entity.attributes ?? []), {
          id: `attribute-${crypto.randomUUID().slice(0, 8)}`,
          ...input,
          value,
          sourceIds: [],
          createdBy: 'user' as const,
          confidence: 0.5,
        }],
      } : entity),
    }));
  }

  function connectCards(sourceId: string, targetId: string) {
    const current = investigationCaseRef.current;
    if (!current) return;
    const result = connectEntities(current, sourceId, targetId, `relation-${crypto.randomUUID().slice(0, 8)}`);
    if (result.created) commit(() => result.investigationCase);
    if (result.relation) {
      setSelectedEntityId(undefined);
      setSelectedRelationId(result.relation.id);
    }
    setMessage(result.created ? 'Связь создана. Уточните её название и описание в инспекторе.' : result.message);
  }

  function updateSelectedRelation(input: { label: string; explanation: string }) {
    if (!selectedRelationId || !input.label.trim()) return;
    commit((current) => ({
      ...current,
      relations: current.relations.map((relation) => relation.id === selectedRelationId ? {
        ...relation,
        label: input.label.trim(),
        explanation: input.explanation.trim() || 'Связь добавлена пользователем и требует проверки источниками.',
      } : relation),
    }));
    setMessage('Свойства связи сохранены.');
  }

  async function findInformation(question: string, focusEntityId = selectedEntityId, file?: File) {
    const focusEntity = investigationCase?.entities.find((entity) => entity.id === focusEntityId);
    if (!focusEntityId || !focusEntity || !investigationCase) {
      setMessage('Сначала выберите карточку, о которой нужно найти информацию.');
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
    const normalizedQuestion = question.trim() || (file
      ? 'Извлеки из документа новые проверяемые сведения и реквизиты выбранного объекта.'
      : 'Найди новые проверяемые сведения об объекте и заполни доступные реквизиты карточки.');
    const initialResearch: EntityResearchState = {
      entityId: focusEntityId, mode: 'information', entityIds: [focusEntityId], status: 'running', stage: 'starting', message: file ? `Загружаю файл «${file.name}».` : 'Ищу информацию и реквизиты объекта.', question: normalizedQuestion, startedAt: new Date().toISOString(), source: file ? 'file' : 'web', fileName: file?.name,
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
      else await api.researchInformationStream(investigationCase.id, focusEntityId, normalizedQuestion, onEvent);
      if (!streamedResult) throw new Error('Codex завершил работу без графа предложений.');
      const latestCase = investigationCaseRef.current ?? investigationCase;
      const currentFocus = latestCase.entities.find((entity) => entity.id === focusEntityId) ?? focusEntity;
      const outcome = mergeResearchResultWithOutcome(latestCase, currentFocus, streamedResult);
      if (outcome.hasNewInformation) commit(() => outcome.investigationCase);
      setResearchByEntityId((current) => ({ ...current, [focusEntityId]: {
        ...(current[focusEntityId] ?? initialResearch), status: 'completed', stage: 'completed',
        message: outcome.hasNewInformation
          ? `Добавлено: ${outcome.addedAttributeCount} реквизитов, ${outcome.addedEntityCount} карточек, ${outcome.addedRelationCount} связей, ${outcome.addedSourceCount} источников, ${outcome.addedQuestionCount} вопросов${outcome.updatedRelationCount ? `; обновлено связей: ${outcome.updatedRelationCount}` : ''}.`
          : 'Новой информации об объекте не найдено.',
        result: outcome.result,
      } }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Не удалось найти информацию об объекте.';
      setResearchByEntityId((current) => ({ ...current, [focusEntityId]: { ...(current[focusEntityId] ?? initialResearch), status: 'error', stage: 'error', message: errorMessage } }));
      setMessage(errorMessage);
    }
  }

  function openFindRelationships(preferredEntityId?: string) {
    if (!investigationCase || investigationCase.entities.length < 2) {
      setMessage('Для поиска связей добавьте на доску минимум две карточки.');
      return;
    }
    if (!health.codex.ready) {
      setPage('settings');
      setMessage('Codex CLI не готов. Проверьте установку и авторизацию в настройках.');
      return;
    }
    const researchSubjectId = getResearchSubjectEntityId(investigationCase);
    setRelationshipInitialEntityIds([...new Set([preferredEntityId, researchSubjectId].filter((id): id is string => Boolean(id)))]);
    setShowFindRelationships(true);
    setEntityMenu(undefined);
  }

  async function findRelationships(entityIds: string[], question: string) {
    if (!investigationCase) return;
    const uniqueEntityIds = [...new Set(entityIds)];
    const focusEntities = uniqueEntityIds.map((entityId) => investigationCase.entities.find((entity) => entity.id === entityId)).filter((entity): entity is InvestigationEntity => Boolean(entity));
    if (focusEntities.length < 2) {
      setMessage('Выберите минимум две разные карточки для поиска связей.');
      return;
    }
    const busyEntity = focusEntities.find((entity) => researchByEntityId[entity.id]?.status === 'running');
    if (busyEntity) {
      setMessage(`Карточка «${busyEntity.title}» уже участвует в исследовании.`);
      return;
    }
    const normalizedQuestion = question.trim() || 'Найди и проверь прямые и косвенные связи между выбранными объектами во всех доступных источниках.';
    const startedAt = new Date().toISOString();
    const titleList = focusEntities.map((entity) => `«${entity.title}»`).join(', ');
    const states = Object.fromEntries(focusEntities.map((entity) => [entity.id, {
      entityId: entity.id,
      mode: 'relationships' as const,
      entityIds: uniqueEntityIds,
      status: 'running' as const,
      stage: 'starting',
      message: `Ищу связи между ${focusEntities.length} выбранными объектами.`,
      question: normalizedQuestion,
      startedAt,
      source: 'web' as const,
    }]));
    setResearchByEntityId((current) => ({ ...current, ...states }));
    setShowFindRelationships(false);
    setMessage(undefined);
    try {
      let streamedResult: EntityResearchState['result'];
      const onEvent = (event: ResearchStreamEvent) => {
        if (event.type === 'status') {
          setResearchByEntityId((current) => {
            const next = { ...current };
            for (const entityId of uniqueEntityIds) next[entityId] = { ...(current[entityId] ?? states[entityId]), stage: event.stage, message: event.message };
            return next;
          });
        }
        if (event.type === 'result') streamedResult = event.result;
      };
      await api.researchRelationshipsStream(investigationCase.id, uniqueEntityIds, normalizedQuestion, onEvent);
      if (!streamedResult) throw new Error('Codex завершил работу без графа предложений.');
      const latestCase = investigationCaseRef.current ?? investigationCase;
      const currentFocus = latestCase.entities.find((entity) => entity.id === uniqueEntityIds[0]) ?? focusEntities[0];
      const outcome = mergeResearchResultWithOutcome(latestCase, currentFocus, streamedResult);
      if (outcome.hasNewInformation) commit(() => outcome.investigationCase);
      const completionMessage = outcome.addedRelationCount || outcome.updatedRelationCount
        ? `Связи найдены: добавлено ${outcome.addedRelationCount}, обновлено ${outcome.updatedRelationCount}; новых объектов: ${outcome.addedEntityCount}.`
        : 'Новых подтверждаемых связей между выбранными объектами не найдено.';
      setResearchByEntityId((current) => {
        const next = { ...current };
        for (const entityId of uniqueEntityIds) next[entityId] = { ...(current[entityId] ?? states[entityId]), status: 'completed', stage: 'completed', message: completionMessage, result: outcome.result };
        return next;
      });
      setMessage(`${titleList}: ${completionMessage}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Не удалось найти связи.';
      setResearchByEntityId((current) => {
        const next = { ...current };
        for (const entityId of uniqueEntityIds) next[entityId] = { ...(current[entityId] ?? states[entityId]), status: 'error', stage: 'error', message: errorMessage };
        return next;
      });
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
      ? `Связанные объекты расставлены вокруг карточки «${selectedEntity.title}».`
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
            <Select className="case-select" value={investigationCase.id} disabled={researching} onChange={(event) => openCase(event.target.value)} aria-label="Текущее дело" title={investigationCase.title}>
              {caseSummaries.map((summary) => <option key={summary.id} value={summary.id}>{summary.title}</option>)}
            </Select>
            <IconButton icon="add" label="Создать новое дело" disabled={researching} onClick={() => setShowCreateCaseDialog(true)} />
          </div>
          <label className="global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти на доске…" /></label>
          <div className="topbar__actions">
            <span className={`save-state save-state--${saveState}`}>{saveState === 'saving' ? 'Сохраняем…' : saveState === 'error' ? 'Ошибка сохранения' : 'Все изменения сохранены'}</span>
            <span className={`ai-status ${health.codex.ready ? 'is-online' : ''}`} title={health.codex.path}><Bot size={14} />{researching ? `${runningResearchCount} в работе` : health.codex.ready ? 'Codex готов' : 'Ручной режим'}</span>
            <button className="secondary-button" onClick={() => {
              if (googleStatus.connected) setShowGoogleContacts(true);
              else { setPage('settings'); setMessage(googleStatus.configured ? 'Сначала подключите аккаунт Google.' : 'Сначала настройте OAuth-клиент Google.'); }
            }}><ContactRound size={16} />Контакты</button>
            <button className="secondary-button" onClick={() => setShowAddDialog(true)}><Plus size={16} />Карточка</button>
            <Button className="arrange-button" icon="network" title={selectedEntity ? `Расставить связи вокруг «${selectedEntity.title}»` : 'Расставить весь граф'} disabled={researching || investigationCase.entities.length === 0} onClick={arrangeObjects}>Расставить</Button>
            <button className="secondary-button topbar-relations" disabled={!health.codex.ready || investigationCase.entities.length < 2} onClick={() => openFindRelationships(selectedEntityId)}><Share2 size={16} />Найти связи</button>
            <button className="primary-button topbar-research" disabled={!selectedEntity || !health.codex.ready || Boolean(selectedEntity && researchByEntityId[selectedEntity.id]?.status === 'running')} onClick={() => findInformation('')}><ShieldCheck size={16} />{selectedEntity && researchByEntityId[selectedEntity.id]?.status === 'running' ? 'В работе…' : 'Найти информацию'}</button>
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
          onConnectEntities={connectCards}
        />
        <div className="board-tools" aria-label="Инструменты доски">
          <LayerControl investigationCase={displayedCase} visibleTypes={visibleTypes} onToggle={toggleLayer} onShowAll={() => setVisibleTypes(new Set(entityTypes))} />
          <EvidenceLegendControl />
        </div>
        {message && <button className="toast" onClick={() => setMessage(undefined)}>{message}<span>×</span></button>}
      </section>
      {inspectorVisible && <Inspector
        entity={selectedEntity}
        relation={selectedRelation}
        allEntities={displayedCase.entities}
        sources={displayedCase.sources}
        aiConfigured={health.codex.ready}
        research={selectedEntity ? researchByEntityId[selectedEntity.id] : undefined}
        provenance={selectedEntity ? getEntityProvenance(displayedCase, selectedEntity) : undefined}
        onAddAttribute={addAttribute}
        onUpdateRelation={updateSelectedRelation}
        onFindInformation={(question, file) => findInformation(question, selectedEntityId, file)}
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
      <FindRelationshipsDialog
        open={showFindRelationships}
        entities={displayedCase.entities}
        initialEntityIds={relationshipInitialEntityIds}
        runningEntityIds={runningEntityIds}
        onClose={() => setShowFindRelationships(false)}
        onStart={(entityIds, question) => void findRelationships(entityIds, question)}
      />
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
            if (entityId) void findInformation('', entityId);
          }}
        >
          Найти информацию об объекте
        </ContextMenuItem>
        <ContextMenuItem disabled={!health.codex.ready || investigationCase.entities.length < 2} onClick={() => openFindRelationships(entityMenu?.entityId)}>
          Найти связи с другими объектами…
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
