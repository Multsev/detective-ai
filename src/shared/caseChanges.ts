import type { CaseChange, CaseFieldChange, InvestigationCase, InvestigationEntity, InvestigationRelation, SourceReference } from './domain.js';

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

function text(value: unknown): string {
  if (Array.isArray(value)) return [...value].sort().join(', ');
  return value === undefined || value === null ? '' : String(value);
}

function changed(field: string, before: unknown, after: unknown): CaseFieldChange | undefined {
  const left = text(before); const right = text(after);
  return left === right ? undefined : { field, before: left || undefined, after: right || undefined };
}

function compact(fields: Array<CaseFieldChange | undefined>): CaseFieldChange[] {
  return fields.filter((field): field is CaseFieldChange => Boolean(field));
}

function entityFields(before: InvestigationEntity, after: InvestigationEntity): CaseFieldChange[] {
  const beforeAttributes = (before.attributes ?? []).map((attribute) => `${attribute.label}: ${attribute.value}`);
  const afterAttributes = (after.attributes ?? []).map((attribute) => `${attribute.label}: ${attribute.value}`);
  return compact([
    changed('Название', before.title, after.title), changed('Подзаголовок', before.subtitle, after.subtitle),
    changed('Описание', before.summary, after.summary), changed('Дата', before.occurredAt, after.occurredAt),
    changed('Реквизиты', beforeAttributes, afterAttributes), changed('Статус вопроса', before.question?.status, after.question?.status),
    changed('Ответ', before.question?.answer, after.question?.answer),
  ]);
}

function relationFields(before: InvestigationRelation, after: InvestigationRelation): CaseFieldChange[] {
  return compact([
    changed('Связь', before.label, after.label), changed('Объяснение', before.explanation, after.explanation),
    changed('Достоверность', before.status, after.status), changed('Уверенность', before.confidence, after.confidence),
    changed('Дата', before.occurredAt, after.occurredAt), changed('Источники', before.sourceIds, after.sourceIds),
  ]);
}

function sourceFields(before: SourceReference, after: SourceReference): CaseFieldChange[] {
  return compact([
    changed('Название источника', before.title, after.title), changed('Издатель', before.publisher, after.publisher),
    changed('Дата публикации', before.publishedAt, after.publishedAt), changed('URL', before.url, after.url),
  ]);
}

function sourceEntityIds(investigationCase: InvestigationCase, sourceId: string): string[] {
  const ids = new Set<string>();
  for (const entity of investigationCase.entities) {
    if ((entity.sourceIds ?? []).includes(sourceId) || (entity.attributes ?? []).some((attribute) => attribute.sourceIds.includes(sourceId))) ids.add(entity.id);
  }
  for (const relation of investigationCase.relations) if (relation.sourceIds.includes(sourceId)) { ids.add(relation.sourceId); ids.add(relation.targetId); }
  return [...ids];
}

function makeChange(input: Omit<CaseChange, 'id' | 'readAt'>): CaseChange {
  return { ...input, id: `change-${stableHash(`${input.researchRunId ?? 'migration'}:${input.kind}:${input.targetId}:${JSON.stringify(input.fields)}:${input.detectedAt}`)}` };
}

export function buildCaseChanges(before: InvestigationCase, after: InvestigationCase, researchRunId?: string, detectedAt = new Date().toISOString()): CaseChange[] {
  const changes: CaseChange[] = [];
  const oldEntities = new Map(before.entities.map((entity) => [entity.id, entity]));
  const oldRelations = new Map(before.relations.map((relation) => [relation.id, relation]));
  const oldSources = new Map(before.sources.map((source) => [source.id, source]));

  for (const entity of after.entities) {
    const previous = oldEntities.get(entity.id);
    if (!previous) {
      changes.push(makeChange({ researchRunId, kind: 'entity_added', targetType: 'entity', targetId: entity.id, entityIds: [entity.id], title: entity.title, summary: `Добавлена карточка «${entity.title}».`, fields: [{ field: 'Тип', after: entity.type }], detectedAt }));
      continue;
    }
    const fields = entityFields(previous, entity);
    if (fields.length) changes.push(makeChange({ researchRunId, kind: entity.type === 'question' ? 'question_updated' : 'entity_updated', targetType: 'entity', targetId: entity.id, entityIds: [entity.id], title: entity.title, summary: entity.type === 'question' ? `Обновлён вопрос «${entity.title}».` : `Обновлена карточка «${entity.title}».`, fields, detectedAt }));
  }

  for (const relation of after.relations) {
    const previous = oldRelations.get(relation.id);
    const entityIds = [relation.sourceId, relation.targetId];
    if (!previous) {
      changes.push(makeChange({ researchRunId, kind: 'relation_added', targetType: 'relation', targetId: relation.id, entityIds, title: relation.label, summary: `Добавлена связь «${relation.label}».`, fields: [{ field: 'Достоверность', after: relation.status }], detectedAt }));
      continue;
    }
    const fields = relationFields(previous, relation);
    if (fields.length) changes.push(makeChange({ researchRunId, kind: 'relation_updated', targetType: 'relation', targetId: relation.id, entityIds, title: relation.label, summary: `Обновлена существующая связь «${relation.label}».`, fields, detectedAt }));
  }

  for (const source of after.sources) {
    const previous = oldSources.get(source.id);
    const entityIds = sourceEntityIds(after, source.id);
    if (!previous) {
      changes.push(makeChange({ researchRunId, kind: 'source_added', targetType: 'source', targetId: source.id, entityIds, title: source.title, summary: `Добавлен источник «${source.title}».`, fields: [{ field: 'URL', after: source.url }], detectedAt }));
      continue;
    }
    const fields = sourceFields(previous, source);
    if (fields.length) changes.push(makeChange({ researchRunId, kind: 'source_updated', targetType: 'source', targetId: source.id, entityIds, title: source.title, summary: `Источник «${source.title}» содержит обновлённые сведения.`, fields, detectedAt }));
    else if (previous.lastCheckedAt !== source.lastCheckedAt || previous.checkCount !== source.checkCount) changes.push(makeChange({ researchRunId, kind: 'source_rechecked', targetType: 'source', targetId: source.id, entityIds, title: source.title, summary: `Источник «${source.title}» проверен повторно, содержательные изменения не обнаружены.`, fields: compact([changed('Проверен', previous.lastCheckedAt, source.lastCheckedAt), changed('Число проверок', previous.checkCount, source.checkCount)]), detectedAt }));
  }
  return changes;
}

export function appendCaseChanges(investigationCase: InvestigationCase, changes: CaseChange[]): InvestigationCase {
  const existing = new Set((investigationCase.changes ?? []).map((change) => change.id));
  return { ...investigationCase, changes: [...(investigationCase.changes ?? []), ...changes.filter((change) => !existing.has(change.id))].slice(-1000) };
}

export function recordResearchRunOutcome(
  investigationCase: InvestigationCase,
  researchRunId: string,
  status: 'completed' | 'error',
  summary: string,
  detectedAt = new Date().toISOString(),
): InvestigationCase {
  const run = (investigationCase.researchRuns ?? []).find((candidate) => candidate.id === researchRunId);
  if (!run || run.entityIds.length === 0) return investigationCase;
  const entityIds = run.entityIds.filter((entityId) => investigationCase.entities.some((entity) => entity.id === entityId));
  if (entityIds.length === 0) return investigationCase;
  const kind = status === 'completed' ? 'research_completed' : 'research_failed';
  const modeTitle = run.mode === 'relationships' ? 'Поиск связи' : run.mode === 'question_resolution' ? 'Проверка вопроса' : 'Поиск информации';
  const finalSummary = summary.trim() || (status === 'completed' ? 'Исследование завершено без новых данных.' : 'Исследование завершилось ошибкой.');
  const substantiveChanges = run.changeIds.filter((changeId) => {
    const change = (investigationCase.changes ?? []).find((candidate) => candidate.id === changeId);
    return change && change.kind !== 'research_completed' && change.kind !== 'research_failed';
  }).length;
  const outcome = makeChange({
    researchRunId,
    kind,
    targetType: 'entity',
    targetId: entityIds[0],
    entityIds,
    title: status === 'completed' ? `${modeTitle} завершён` : `${modeTitle}: ошибка`,
    summary: finalSummary,
    fields: [
      { field: 'Запрос', after: run.question || 'Запрос не указан' },
      { field: 'Результат', after: finalSummary },
      { field: 'Изменений', after: String(substantiveChanges) },
    ],
    detectedAt,
  });
  const withOutcome = appendCaseChanges(investigationCase, [outcome]);
  return {
    ...withOutcome,
    researchRuns: (withOutcome.researchRuns ?? []).map((candidate) => candidate.id === researchRunId
      ? { ...candidate, changeIds: [...new Set([...candidate.changeIds, outcome.id])] }
      : candidate),
  };
}

export function getUnreadCaseChanges(investigationCase: InvestigationCase): CaseChange[] {
  return (investigationCase.changes ?? []).filter((change) => !change.readAt).sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));
}

export function getEntityCaseChanges(investigationCase: InvestigationCase, entityId: string): CaseChange[] {
  return (investigationCase.changes ?? []).filter((change) => change.entityIds.includes(entityId)).sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));
}

export function markCaseChangesRead(investigationCase: InvestigationCase, changeIds: Iterable<string>, readAt = new Date().toISOString()): InvestigationCase {
  const ids = new Set(changeIds);
  return { ...investigationCase, changes: (investigationCase.changes ?? []).map((change) => ids.has(change.id) ? { ...change, readAt: change.readAt ?? readAt } : change) };
}
