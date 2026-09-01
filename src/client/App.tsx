import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link2, Search } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator, frameworkPersistence, IconButton, Menu, MenuBar, SelectionModel, type MenuEntry } from '@operator-ui/framework';
import type {
  CaseSummary,
  CreateCaseInput,
  EntityResearchState,
  EntityAttributeKind,
  EntityType,
  EvidenceStatus,
  GoogleContact,
  GoogleIntegrationStatus,
  HealthStatus,
  InvestigationCase,
  InvestigationEntity,
  InvestigationRelation,
  ResearchStreamEvent,
} from '../shared/domain';
import { entityTypes, evidenceStatuses } from '../shared/domain';
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
import { Inspector } from './components/Inspector';
import { SettingsPage } from './components/SettingsPage';
import { GoogleContactsDialog } from './components/GoogleContactsDialog';
import { FindRelationshipsDialog } from './components/FindRelationshipsDialog';
import { DisplayControl, type DisplayOpenRequest } from './components/DisplayControl';
import { FindInformationDialog } from './components/FindInformationDialog';
import { ManualLinkDialog } from './components/ManualLinkDialog';
import { RenameCaseDialog } from './components/RenameCaseDialog';
import { ResearchQueueControl } from './components/ResearchQueueControl';
import { downloadCaseFile, parseCaseFile } from './lib/caseFile';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export function App() {
  const [investigationCase, setInvestigationCase] = useState<InvestigationCase>();
  const [caseSummaries, setCaseSummaries] = useState<CaseSummary[]>([]);
  const [health, setHealth] = useState<HealthStatus>({
    ok: false,
    codex: { installed: false, authenticated: false, ready: false, path: '', version: '', authMessage: '', checkedAt: '' },
  });
  const [googleStatus, setGoogleStatus] = useState<GoogleIntegrationStatus>({ configured: false, connected: false, scope: '', message: 'Проверяем интеграцию…' });
  const [page, setPage] = useState<'board' | 'settings'>(() => new URLSearchParams(window.location.search).has('google') ? 'settings' : 'board');
  const entitySelection = useMemo(() => new SelectionModel<string>(), []);
  const selection = useSyncExternalStore(entitySelection.subscribe, entitySelection.getSnapshot);
  const selectedEntityId = selection.active ?? undefined;
  const selectedEntityIds = selection.selected;
  const [inspectorEntityId, setInspectorEntityId] = useState<string>();
  const [selectedRelationId, setSelectedRelationId] = useState<string>();
  const [visibleTypes, setVisibleTypes] = useState<Set<EntityType>>(() => new Set(entityTypes));
  const [visibleEvidenceStatuses, setVisibleEvidenceStatuses] = useState<Set<EvidenceStatus>>(() => new Set(evidenceStatuses));
  const [onlySubjectNetwork, setOnlySubjectNetwork] = useState(false);
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [autoFitResearch, setAutoFitResearch] = useState(() => frameworkPersistence.get<boolean>('detective:auto-fit-research', true, (value): value is boolean => typeof value === 'boolean'));
  const [autoOpenInspector, setAutoOpenInspector] = useState(() => frameworkPersistence.get<boolean>('detective:auto-open-inspector', false, (value): value is boolean => typeof value === 'boolean'));
  const [autoSave, setAutoSave] = useState(() => frameworkPersistence.get<boolean>('detective:auto-save', true, (value): value is boolean => typeof value === 'boolean'));
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCreateCaseDialog, setShowCreateCaseDialog] = useState(false);
  const [showGoogleContacts, setShowGoogleContacts] = useState(false);
  const [showFindRelationships, setShowFindRelationships] = useState(false);
  const [informationDialogEntityIds, setInformationDialogEntityIds] = useState<string[]>([]);
  const [showRenameCase, setShowRenameCase] = useState(false);
  const [showManualLinkDialog, setShowManualLinkDialog] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string>();
  const [linkTargetIds, setLinkTargetIds] = useState<string[]>([]);
  const [relationshipInitialEntityIds, setRelationshipInitialEntityIds] = useState<string[]>([]);
  const [entityMenu, setEntityMenu] = useState<{ entityId: string; x: number; y: number }>();
  const [paneMenu, setPaneMenu] = useState<{ x: number; y: number }>();
  const [pendingDeleteEntityIds, setPendingDeleteEntityIds] = useState<string[]>([]);
  const [researchByEntityId, setResearchByEntityId] = useState<Record<string, EntityResearchState>>({});
  const [refreshingCodex, setRefreshingCodex] = useState(false);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  const [revealEntityRequest, setRevealEntityRequest] = useState<{ entityId: string; key: number }>();
  const [fitGraphRequestKey, setFitGraphRequestKey] = useState<number>();
  const [displayOpenRequest, setDisplayOpenRequest] = useState<DisplayOpenRequest>();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string>();
  const investigationCaseRef = useRef<InvestigationCase | undefined>(undefined);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const undoStack = useRef<InvestigationCase[]>([]);
  const redoStack = useRef<InvestigationCase[]>([]);
  const caseFileInput = useRef<HTMLInputElement>(null);
  const entityFileInput = useRef<HTMLInputElement>(null);
  const researching = Object.values(researchByEntityId).some((research) => research.status === 'running');
  const runningEntityIds = useMemo(() => new Set(Object.values(researchByEntityId).filter((research) => research.status === 'running').map((research) => research.entityId)), [researchByEntityId]);

  useEffect(() => {
    frameworkPersistence.set('detective:auto-fit-research', autoFitResearch);
  }, [autoFitResearch]);

  useEffect(() => { frameworkPersistence.set('detective:auto-open-inspector', autoOpenInspector); }, [autoOpenInspector]);
  useEffect(() => { frameworkPersistence.set('detective:auto-save', autoSave); }, [autoSave]);

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

  const selectedEntity = useMemo(() => investigationCase?.entities.find((entity) => entity.id === selectedEntityId), [investigationCase, selectedEntityId]);
  const inspectorEntity = useMemo(() => investigationCase?.entities.find((entity) => entity.id === inspectorEntityId), [inspectorEntityId, investigationCase]);
  const selectedRelation = useMemo(
    () => investigationCase?.relations.find((relation) => relation.id === selectedRelationId),
    [investigationCase, selectedRelationId],
  );

  useEffect(() => {
    if (!selectedEntity || isEntityVisible(selectedEntity, visibleTypes, search)) return;
    entitySelection.clear();
    setInspectorEntityId(undefined);
    setSelectedRelationId(undefined);
  }, [entitySelection, search, selectedEntity, visibleTypes]);

  useEffect(() => {
    if (!investigationCase) return;
    entitySelection.reconcile(investigationCase.entities.map((entity) => entity.id));
  }, [entitySelection, investigationCase]);

  useEffect(() => {
    const closeInspectorOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || page !== 'board') return;
      entitySelection.clear();
      setInspectorEntityId(undefined);
      setSelectedRelationId(undefined);
      setLinkMode(false);
    };
    window.addEventListener('keydown', closeInspectorOnEscape);
    return () => window.removeEventListener('keydown', closeInspectorOnEscape);
  }, [entitySelection, page]);

  function queueCaseSave(next: InvestigationCase) {
    setSaveState('saving');
    saveQueue.current = saveQueue.current.catch(() => undefined).then(() => api.saveCase(next))
      .then((savedCase) => {
        if (investigationCaseRef.current?.id === savedCase.id) {
          investigationCaseRef.current = { ...investigationCaseRef.current, updatedAt: savedCase.updatedAt };
          setInvestigationCase(investigationCaseRef.current);
        }
        setCaseSummaries((summaries) => summaries.map((summary) => summary.id === savedCase.id ? { ...summary, title: savedCase.title, subject: savedCase.subject, updatedAt: savedCase.updatedAt, entityCount: savedCase.entities.length, relationCount: savedCase.relations.length } : summary));
        setSaveState('saved');
        return savedCase;
      })
      .catch((error: Error) => { setSaveState('error'); setMessage(error.message); throw error; });
    return saveQueue.current;
  }

  function commit(update: (current: InvestigationCase) => InvestigationCase, recordHistory = true) {
    const current = investigationCaseRef.current;
    if (!current) return;
    const next = update(current);
    if (next === current) return;
    if (recordHistory) {
      undoStack.current = [...undoStack.current.slice(-49), current];
      redoStack.current = [];
    }
    investigationCaseRef.current = next;
    setInvestigationCase(next);
    if (autoSave) void queueCaseSave(next).catch(() => undefined);
    else setSaveState('dirty');
  }

  async function saveCurrentCase() {
    const current = investigationCaseRef.current;
    if (!current) return;
    await queueCaseSave(current);
    setMessage('Дело сохранено.');
  }

  function undo() {
    const previous = undoStack.current.pop();
    const current = investigationCaseRef.current;
    if (!previous || !current) return;
    redoStack.current.push(current);
    investigationCaseRef.current = previous;
    setInvestigationCase(previous);
    if (autoSave) void queueCaseSave(previous).catch(() => undefined); else setSaveState('dirty');
  }

  function redo() {
    const next = redoStack.current.pop();
    const current = investigationCaseRef.current;
    if (!next || !current) return;
    undoStack.current.push(current);
    investigationCaseRef.current = next;
    setInvestigationCase(next);
    if (autoSave) void queueCaseSave(next).catch(() => undefined); else setSaveState('dirty');
  }

  async function openCase(caseId: string) {
    if (researching) return;
    try {
      if (saveState === 'dirty') await saveCurrentCase();
      const loadedCase = await api.loadCase(caseId);
      setInvestigationCase(loadedCase);
      investigationCaseRef.current = loadedCase;
      entitySelection.clear();
      setInspectorEntityId(undefined);
      setSelectedRelationId(undefined);
      setResearchByEntityId({});
      undoStack.current = [];
      redoStack.current = [];
      setSaveState('saved');
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
      investigationCaseRef.current = createdCase;
      if (createdCase.entities[0]) entitySelection.select(createdCase.entities[0].id, createdCase.entities.map((entity) => entity.id));
      setSelectedRelationId(undefined);
      setInspectorEntityId(undefined);
      setShowCreateCaseDialog(false);
      setPage('board');
      setMessage(`${createdCase.title} создано.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось создать дело.');
    }
  }

  async function importCaseFile(file: File) {
    try {
      const importedCase = await api.importCase(parseCaseFile(await file.text()));
      setCaseSummaries(await api.listCases());
      investigationCaseRef.current = importedCase;
      setInvestigationCase(importedCase);
      entitySelection.clear();
      setInspectorEntityId(undefined);
      setSelectedRelationId(undefined);
      setResearchByEntityId({});
      setSaveState('saved');
      setPage('board');
      setMessage(`Файл «${file.name}» открыт.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось открыть файл дела.');
    } finally {
      if (caseFileInput.current) caseFileInput.current.value = '';
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
    entitySelection.select(id, [...(investigationCase?.entities ?? []).map((entity) => entity.id), id]);
    setSelectedRelationId(undefined);
    if (autoOpenInspector) setInspectorEntityId(id);
    setShowAddDialog(false);
  }

  function addDocumentEntity(file: File) {
    const title = file.name.replace(/\.(pdf|md|markdown)$/i, '') || file.name;
    const id = `document-${crypto.randomUUID().slice(0, 8)}`;
    const sourceId = `source-${crypto.randomUUID().slice(0, 8)}`;
    commit((current) => ({
      ...current,
      entities: [...current.entities, { id, type: 'document', title, subtitle: file.name, summary: 'Документ добавлен пользователем. Откройте контекстное меню связанной карточки, чтобы исследовать его содержание.', position: { x: 260 + Math.random() * 420, y: 180 + Math.random() * 280 }, facts: [], attributes: [], sourceIds: [sourceId], createdBy: 'user' }],
      sources: [...current.sources, { id: sourceId, title: file.name, url: `case-file://local/${encodeURIComponent(file.name)}`, publisher: 'Файл пользователя', publishedAt: '', accessedAt: new Date().toISOString(), kind: 'uploaded_file' }],
    }));
    entitySelection.select(id, [...investigationCase!.entities.map((entity) => entity.id), id]);
    setMessage(`Документ «${file.name}» добавлен на доску.`);
    if (entityFileInput.current) entityFileInput.current.value = '';
  }

  function addGoogleContact(contact: GoogleContact) {
    if (!investigationCase) return;
    const result = mergeGoogleContact(investigationCase, contact);
    if (result.created) commit(() => result.investigationCase);
    entitySelection.select(result.entityId, result.investigationCase.entities.map((entity) => entity.id));
    setSelectedRelationId(undefined);
    if (autoOpenInspector) setInspectorEntityId(result.entityId);
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
      entitySelection.clear();
      setInspectorEntityId(undefined);
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
    entitySelection.select(focusEntityId, investigationCase.entities.map((entity) => entity.id));
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

  function openFindRelationships(preferredEntityIds: string[] = []) {
    if (!investigationCase || investigationCase.entities.length < 2) {
      setMessage('Для поиска связей добавьте на доску минимум две карточки.');
      return;
    }
    if (!health.codex.ready) {
      setPage('settings');
      setMessage('Codex CLI не готов. Проверьте установку и авторизацию в настройках.');
      return;
    }
    setRelationshipInitialEntityIds([...new Set(preferredEntityIds)]);
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

  function deleteEntities(entityIds: string[]) {
    if (!investigationCase) return;
    const ids = new Set(entityIds);
    const entities = investigationCase.entities.filter((item) => ids.has(item.id));
    if (entities.length === 0) return;
    const relationCount = investigationCase.relations.filter((relation) => ids.has(relation.sourceId) || ids.has(relation.targetId)).length;
    commit((current) => entityIds.reduce((next, entityId) => removeEntityFromCase(next, entityId), current));
    entitySelection.clear();
    setInspectorEntityId(undefined);
    setSelectedRelationId(undefined);
    setPendingDeleteEntityIds([]);
    setEntityMenu(undefined);
    setMessage(`${entities.length === 1 ? `Карточка «${entities[0].title}»` : `Карточек удалено: ${entities.length}`} и ${relationCount} связ. удалены.`);
  }

  function arrangeObjects() {
    if (!investigationCase || investigationCase.entities.length === 0 || researching) return;
    commit((current) => arrangeInvestigationGraph(current, selectedEntityId));
    setFitGraphRequestKey((current) => (current ?? 0) + 1);
    setMessage(selectedEntity
      ? `Связанные объекты расставлены вокруг карточки «${selectedEntity.title}».`
      : 'Объекты расставлены как связные деревья.');
  }

  function handleEntitySelection(entityId: string, additive: boolean) {
    if (!investigationCase) return;
    if (linkMode) {
      if (!linkSourceId) {
        setLinkSourceId(entityId);
        setLinkTargetIds([]);
        entitySelection.select(entityId, investigationCase.entities.map((entity) => entity.id));
      } else if (entityId !== linkSourceId) {
        setLinkTargetIds((current) => {
          const next = current.includes(entityId) ? current.filter((id) => id !== entityId) : [...current, entityId];
          entitySelection.selectAll([linkSourceId, ...next]);
          return next;
        });
      }
      setSelectedRelationId(undefined);
      return;
    }
    entitySelection.select(entityId, investigationCase.entities.map((entity) => entity.id), { toggle: additive });
    setSelectedRelationId(undefined);
    if (!additive && autoOpenInspector) setInspectorEntityId(entityId);
  }

  function clearSelection() {
    entitySelection.clear();
    setSelectedRelationId(undefined);
    if (!autoOpenInspector) setInspectorEntityId(undefined);
  }

  function openInformationDialog(entityIds: Iterable<string>) {
    const ids = [...entityIds];
    if (ids.length === 0) return;
    setInformationDialogEntityIds(ids);
    setEntityMenu(undefined);
  }

  function startManualLink(entityIds = [...selectedEntityIds]) {
    if (entityIds.length < 2) {
      setLinkMode(true);
      setLinkSourceId(entityIds[0]);
      setLinkTargetIds([]);
      setEntityMenu(undefined);
      return;
    }
    const sourceId = selectedEntityId && entityIds.includes(selectedEntityId) ? selectedEntityId : entityIds[0];
    setLinkSourceId(sourceId);
    setLinkTargetIds(entityIds.filter((id) => id !== sourceId));
    setShowManualLinkDialog(true);
    setEntityMenu(undefined);
  }

  function createManualLinks(label: string, explanation: string) {
    if (!linkSourceId || linkTargetIds.length === 0) return;
    let createdCount = 0;
    commit((current) => {
      let next = current;
      for (const targetId of linkTargetIds) {
        const result = connectEntities(next, linkSourceId, targetId, `relation-${crypto.randomUUID().slice(0, 8)}`);
        if (!result.created || !result.relation) continue;
        createdCount += 1;
        next = { ...result.investigationCase, relations: result.investigationCase.relations.map((relation) => relation.id === result.relation?.id ? { ...relation, label, explanation: explanation || 'Связь добавлена пользователем и требует проверки источниками.' } : relation) };
      }
      return next;
    });
    setShowManualLinkDialog(false);
    setLinkMode(false);
    setLinkSourceId(undefined);
    setLinkTargetIds([]);
    setMessage(createdCount ? `Создано ручных связей: ${createdCount}.` : 'Такие связи уже существуют.');
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

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (page !== 'board') return;
      const target = event.target as HTMLElement | null;
      const editing = target?.matches('input, textarea, select, [contenteditable="true"]');
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (command && key === 's') { event.preventDefault(); if (event.shiftKey && investigationCase) downloadCaseFile(investigationCase); else void saveCurrentCase(); return; }
      if (command && key === 'o') { event.preventDefault(); caseFileInput.current?.click(); return; }
      if (command && key === 'n') { event.preventDefault(); if (!researching) setShowCreateCaseDialog(true); return; }
      if (command && key === 'f') { event.preventDefault(); setSearchVisible(true); return; }
      if (editing) return;
      if (command && key === 'a' && investigationCase) { event.preventDefault(); entitySelection.selectAll(investigationCase.entities.filter((entity) => isEntityVisible(entity, visibleTypes, search)).map((entity) => entity.id)); return; }
      if (command && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (event.key === 'Delete' && selectedEntityIds.size > 0 && !researching) { event.preventDefault(); setPendingDeleteEntityIds([...selectedEntityIds]); return; }
      if (event.key === 'Insert') { event.preventDefault(); setShowAddDialog(true); return; }
      if (event.key === 'Enter') {
        if (linkMode && linkSourceId && linkTargetIds.length > 0) { event.preventDefault(); setShowManualLinkDialog(true); return; }
        if (selectedEntityId) { event.preventDefault(); setInspectorEntityId(selectedEntityId); }
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  });

  if (!investigationCase) {
    return <div className="loading-screen"><span className="brand__mark">D</span><p>{message ?? 'Открываем материалы дела…'}</p></div>;
  }
  const displayedCase = investigationCase;
  const defaultSubjectEntityId = getDefaultSubjectEntityId(investigationCase);
  const researchSubjectEntityId = getResearchSubjectEntityId(investigationCase);
  const inspectorVisible = page === 'board' && Boolean(inspectorEntity || selectedRelation);
  const selectedEntities = investigationCase.entities.filter((entity) => selectedEntityIds.has(entity.id));
  const informationDialogEntities = investigationCase.entities.filter((entity) => informationDialogEntityIds.includes(entity.id));
  const pendingDeleteIdSet = new Set(pendingDeleteEntityIds);
  const pendingDeleteEntities = investigationCase.entities.filter((entity) => pendingDeleteIdSet.has(entity.id));
  const pendingDeleteRelationCount = investigationCase.relations.filter((relation) => pendingDeleteIdSet.has(relation.sourceId) || pendingDeleteIdSet.has(relation.targetId)).length;
  const linkSource = investigationCase.entities.find((entity) => entity.id === linkSourceId);
  const linkTargets = investigationCase.entities.filter((entity) => linkTargetIds.includes(entity.id));

  function toggleLayer(type: EntityType) {
    setVisibleTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleEvidence(status: EvidenceStatus) {
    setVisibleEvidenceStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }

  const fileMenu: MenuEntry[] = [
    { label: 'Новое дело…', shortcut: 'Ctrl+N', disabled: researching, action: () => setShowCreateCaseDialog(true) },
    { label: 'Открыть файл дела…', shortcut: 'Ctrl+O', disabled: researching, action: () => caseFileInput.current?.click() },
    { type: 'submenu', label: 'Недавние дела', items: caseSummaries.map((summary) => ({ label: summary.title, checked: summary.id === investigationCase.id, disabled: researching, action: () => void openCase(summary.id) })) },
    { type: 'separator' },
    { label: 'Сохранить', shortcut: 'Ctrl+S', action: () => void saveCurrentCase() },
    { label: 'Сохранить как…', shortcut: 'Ctrl+Shift+S', action: () => downloadCaseFile(investigationCase) },
    { label: 'Переименовать дело…', action: () => setShowRenameCase(true) },
    { type: 'separator' },
    { label: 'Экспортировать файл дела', action: () => downloadCaseFile(investigationCase) },
  ];
  const editMenu: MenuEntry[] = [
    { label: 'Отменить', shortcut: 'Ctrl+Z', disabled: undoStack.current.length === 0, action: undo },
    { label: 'Повторить', shortcut: 'Ctrl+Shift+Z', disabled: redoStack.current.length === 0, action: redo },
    { type: 'separator' },
    { label: 'Выбрать всё', shortcut: 'Ctrl+A', action: () => entitySelection.selectAll(investigationCase.entities.filter((entity) => isEntityVisible(entity, visibleTypes, search)).map((entity) => entity.id)) },
    { label: 'Снять выделение', shortcut: 'Esc', disabled: selectedEntityIds.size === 0, action: clearSelection },
    { label: 'Удалить выбранное…', shortcut: 'Delete', disabled: selectedEntityIds.size === 0 || researching, action: () => setPendingDeleteEntityIds([...selectedEntityIds]) },
  ];
  const viewMenu: MenuEntry[] = [
    { label: 'Найти на доске…', shortcut: 'Ctrl+F', checked: searchVisible, action: () => setSearchVisible(true) },
    { label: 'Инспектор', shortcut: 'Enter', checked: inspectorVisible, disabled: !selectedEntityId && !selectedRelation, action: () => { if (selectedEntityId) setInspectorEntityId(selectedEntityId); } },
    { label: 'Фильтры…', action: () => setDisplayOpenRequest({ key: Date.now(), tab: 'filters' }) },
    { label: 'Легенда связей…', action: () => setDisplayOpenRequest({ key: Date.now(), tab: 'legend' }) },
    { type: 'separator' },
    { label: selectedEntity ? 'Расставить вокруг активной карточки' : 'Расставить весь граф', disabled: researching || investigationCase.entities.length === 0, action: arrangeObjects },
    { label: 'Вписать граф в экран', disabled: investigationCase.entities.length === 0, action: () => setFitGraphRequestKey((current) => (current ?? 0) + 1) },
  ];

  return (
    <main className={`app-shell ${inspectorVisible ? 'has-inspector' : ''}`} data-theme="dark">
      {page === 'settings' ? (
        <SettingsPage health={health} refreshing={refreshingCodex} autoFitResearch={autoFitResearch} onAutoFitResearchChange={setAutoFitResearch} autoOpenInspector={autoOpenInspector} onAutoOpenInspectorChange={setAutoOpenInspector} autoSave={autoSave} onAutoSaveChange={setAutoSave} googleStatus={googleStatus} disconnectingGoogle={disconnectingGoogle} onDisconnectGoogle={disconnectGoogle} onRefresh={refreshCodexStatus} onOpenBoard={() => setPage('board')} />
      ) : <>
      <section className="workspace">
        <header className="topbar">
          <span className="brand__mark">D</span>
          <MenuBar><Menu label="Файл" items={fileMenu} /><Menu label="Правка" items={editMenu} /><Menu label="Вид" items={viewMenu} /></MenuBar>
          <div className="document-title" title={investigationCase.title}>{investigationCase.title}{saveState === 'dirty' && <span aria-label="Есть несохранённые изменения">*</span>}</div>
          <div className="topbar__actions">
            <span className={`save-state save-state--${saveState}`} title={saveState === 'error' ? 'Ошибка сохранения' : saveState === 'dirty' ? 'Есть несохранённые изменения' : 'Дело сохранено'}>{saveState === 'saving' ? 'Сохраняем…' : saveState === 'error' ? 'Ошибка' : saveState === 'dirty' ? 'Изменено' : ''}</span>
            <ResearchQueueControl research={researchByEntityId} entities={investigationCase.entities} />
            <IconButton icon="search" label="Найти на доске" aria-expanded={searchVisible} onClick={() => setSearchVisible((current) => !current)} />
            <IconButton icon="settings" label="Настройки" onClick={() => setPage('settings')} />
          </div>
          {searchVisible && <label className="global-search is-overlay"><Search size={14} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти на доске…" /><button aria-label="Закрыть поиск" onClick={() => { setSearch(''); setSearchVisible(false); }}>×</button></label>}
        </header>
        <Board
          investigationCase={displayedCase}
          selectedEntityIds={selectedEntityIds}
          activeEntityId={selectedEntityId}
          visibleTypes={visibleTypes}
          visibleEvidenceStatuses={visibleEvidenceStatuses}
          onlySubjectNetwork={onlySubjectNetwork}
          search={search}
          researchByEntityId={researchByEntityId}
          autoFitResearch={autoFitResearch}
          researching={researching}
          revealEntityRequest={revealEntityRequest}
          fitGraphRequestKey={fitGraphRequestKey}
          onSelectEntity={handleEntitySelection}
          onClearSelection={clearSelection}
          onOpenEntity={(entityId) => { entitySelection.select(entityId, investigationCase.entities.map((entity) => entity.id)); setInspectorEntityId(entityId); setSelectedRelationId(undefined); }}
          onOpenEntityMenu={(entityId, position) => { if (selectedEntityIds.has(entityId)) entitySelection.setActive(entityId); else entitySelection.select(entityId, investigationCase.entities.map((entity) => entity.id)); setSelectedRelationId(undefined); setPaneMenu(undefined); setEntityMenu({ entityId, ...position }); }}
          onOpenPaneMenu={(position) => { setEntityMenu(undefined); setPaneMenu(position); }}
          onOpenAddEntity={() => setShowAddDialog(true)}
          onSelectRelation={(relation) => { setSelectedRelationId(relation.id); setInspectorEntityId(undefined); entitySelection.clear(); }}
          onMoveEntity={(entityId, position) => commit((current) => ({
            ...current,
            entities: current.entities.map((entity) => entity.id === entityId ? { ...entity, position } : entity),
          }))}
          onConnectEntities={connectCards}
        />
        {selectedEntityIds.size > 1 && !linkMode && <div className="selection-summary">Выбрано: <strong>{selectedEntityIds.size}</strong><button onClick={clearSelection}>Снять выделение</button></div>}
        {linkMode && <div className="link-mode-bar"><Link2 size={14} /><span>{linkSource ? `Источник: ${linkSource.title}` : 'Выберите исходную карточку'}{linkTargets.length ? ` · целей: ${linkTargets.length}` : ' · затем выберите связанные объекты'}</span><button disabled={!linkSource || linkTargets.length === 0} onClick={() => setShowManualLinkDialog(true)}>Enter — создать</button><button onClick={() => { setLinkMode(false); setLinkSourceId(undefined); setLinkTargetIds([]); }}>Esc — отменить</button></div>}
        <div className="board-tools" aria-label="Инструменты доски">
          <button className={`board-tool-button ${linkMode ? 'is-active' : ''}`} aria-label="Ручная связь" aria-pressed={linkMode} onClick={() => { if (linkMode) { setLinkMode(false); setLinkSourceId(undefined); setLinkTargetIds([]); } else startManualLink(); }} title="Ручная связь"><Link2 size={14} /></button>
          <DisplayControl investigationCase={displayedCase} visibleTypes={visibleTypes} visibleEvidenceStatuses={visibleEvidenceStatuses} onlySubjectNetwork={onlySubjectNetwork} openRequest={displayOpenRequest} onToggleType={toggleLayer} onToggleEvidence={toggleEvidence} onOnlySubjectNetworkChange={setOnlySubjectNetwork} onReset={() => { setVisibleTypes(new Set(entityTypes)); setVisibleEvidenceStatuses(new Set(evidenceStatuses)); setOnlySubjectNetwork(false); }} />
        </div>
        {message && <button className="toast" onClick={() => setMessage(undefined)}>{message}<span>×</span></button>}
      </section>
      {inspectorVisible && <Inspector
        entity={inspectorEntity}
        relation={selectedRelation}
        allEntities={displayedCase.entities}
        sources={displayedCase.sources}
        research={inspectorEntity ? researchByEntityId[inspectorEntity.id] : undefined}
        provenance={inspectorEntity ? getEntityProvenance(displayedCase, inspectorEntity) : undefined}
        onAddAttribute={addAttribute}
        onUpdateRelation={updateSelectedRelation}
        onClose={() => { setInspectorEntityId(undefined); setSelectedRelationId(undefined); }}
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
      <FindInformationDialog open={informationDialogEntityIds.length > 0} entities={informationDialogEntities} aiConfigured={health.codex.ready} runningEntityIds={runningEntityIds} onClose={() => setInformationDialogEntityIds([])} onStart={(question, file) => { const ids = [...informationDialogEntityIds]; setInformationDialogEntityIds([]); void Promise.allSettled(ids.map((entityId) => findInformation(question, entityId, file))); }} />
      <ManualLinkDialog open={showManualLinkDialog} source={linkSource} targets={linkTargets} onClose={() => setShowManualLinkDialog(false)} onCreate={createManualLinks} />
      <RenameCaseDialog open={showRenameCase} title={investigationCase.title} onClose={() => setShowRenameCase(false)} onRename={(title) => { commit((current) => ({ ...current, title })); setShowRenameCase(false); }} />
      <input ref={caseFileInput} className="visually-hidden" type="file" accept=".detective,.json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCaseFile(file); }} />
      <input ref={entityFileInput} className="visually-hidden" type="file" accept=".pdf,.md,.markdown,application/pdf,text/markdown" onChange={(event) => { const file = event.target.files?.[0]; if (file) addDocumentEntity(file); }} />
      <ContextMenu open={Boolean(entityMenu)} x={entityMenu?.x ?? 0} y={entityMenu?.y ?? 0} onClose={() => setEntityMenu(undefined)}>
        <ContextMenuItem onClick={() => { if (selectedEntityId) setInspectorEntityId(selectedEntityId); setEntityMenu(undefined); }}>{selectedEntityIds.size > 1 ? `Открыть активную карточку` : 'Открыть карточку'}</ContextMenuItem>
        {selectedEntityIds.size === 1 && entityMenu && entityMenu.entityId !== researchSubjectEntityId && <ContextMenuItem disabled={researching} onClick={() => chooseResearchSubject(entityMenu.entityId)}>
          Установить как исследуемый объект
        </ContextMenuItem>}
        {selectedEntityIds.size === 1 && researchSubjectEntityId !== defaultSubjectEntityId && <ContextMenuItem disabled={researching} onClick={restoreDefaultResearchSubject}>
          Вернуть исходный объект
        </ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!health.codex.ready || selectedEntities.some((entity) => runningEntityIds.has(entity.id))} onClick={() => openInformationDialog(selectedEntityIds)}>Найти информацию{selectedEntityIds.size > 1 ? ` по выбранным (${selectedEntityIds.size})…` : '…'}</ContextMenuItem>
        {selectedEntityIds.size >= 2 && <ContextMenuItem disabled={!health.codex.ready || selectedEntities.some((entity) => runningEntityIds.has(entity.id))} onClick={() => { setEntityMenu(undefined); openFindRelationships([...selectedEntityIds]); }}>Найти связь между выбранными ({selectedEntityIds.size})…</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => startManualLink([...selectedEntityIds])}>{selectedEntityIds.size > 1 ? 'Связать выбранные…' : 'Начать ручную связь'}</ContextMenuItem>
        <ContextMenuItem disabled={researching} onClick={() => { arrangeObjects(); setEntityMenu(undefined); }}>{selectedEntityIds.size > 1 ? 'Расставить выбранные' : 'Расставить вокруг карточки'}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={researching}
          onClick={() => { setPendingDeleteEntityIds([...selectedEntityIds]); setEntityMenu(undefined); }}
        >Удалить {selectedEntityIds.size > 1 ? `выбранные карточки (${selectedEntityIds.size})…` : 'карточку и связи…'}</ContextMenuItem>
      </ContextMenu>
      <ContextMenu open={Boolean(paneMenu)} x={paneMenu?.x ?? 0} y={paneMenu?.y ?? 0} onClose={() => setPaneMenu(undefined)}>
        <ContextMenuItem onClick={() => { setShowAddDialog(true); setPaneMenu(undefined); }}>Добавить объект вручную…</ContextMenuItem>
        <ContextMenuItem onClick={() => { setPaneMenu(undefined); if (googleStatus.connected) setShowGoogleContacts(true); else { setPage('settings'); setMessage('Сначала подключите Google Контакты в настройках.'); } }}>Добавить из Google Контактов…</ContextMenuItem>
        <ContextMenuItem onClick={() => { setPaneMenu(undefined); entityFileInput.current?.click(); }}>Добавить PDF или Markdown…</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={researching || investigationCase.entities.length === 0} onClick={() => { clearSelection(); arrangeObjects(); setPaneMenu(undefined); }}>Расставить весь граф</ContextMenuItem>
        <ContextMenuItem disabled={investigationCase.entities.length === 0} onClick={() => { setFitGraphRequestKey((current) => (current ?? 0) + 1); setPaneMenu(undefined); }}>Вписать граф в экран</ContextMenuItem>
      </ContextMenu>
      <DeleteEntityDialog
        entityTitle={pendingDeleteEntities.length > 1 ? `${pendingDeleteEntities.length} выбранных карточек` : pendingDeleteEntities[0]?.title}
        relationCount={pendingDeleteRelationCount}
        onClose={() => setPendingDeleteEntityIds([])}
        onConfirm={() => deleteEntities(pendingDeleteEntityIds)}
      />
    </main>
  );
}
