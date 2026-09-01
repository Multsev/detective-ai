import type { EntityAttribute, EntityType, InvestigationCase, InvestigationEntity, InvestigationRelation, ResearchEntityAttribute, ResearchResult } from '../../shared/domain';
import { normalizeCaseSubject } from '../../shared/caseSubject';
import { attributeIdentityKey } from '../../shared/entityAttributeCatalog';

export interface ResearchMergeOutcome {
  investigationCase: InvestigationCase;
  result: ResearchResult;
  addedEntityCount: number;
  addedRelationCount: number;
  addedSourceCount: number;
  addedQuestionCount: number;
  updatedRelationCount: number;
  addedAttributeCount: number;
  updatedEntityCount: number;
  hasNewInformation: boolean;
}

export interface InteractiveRelationResult {
  investigationCase: InvestigationCase;
  relation?: InvestigationRelation;
  created: boolean;
  message?: string;
}

export function connectEntities(
  investigationCase: InvestigationCase,
  sourceId: string,
  targetId: string,
  relationId: string,
): InteractiveRelationResult {
  if (sourceId === targetId) return { investigationCase, created: false, message: 'Карточку нельзя связать саму с собой.' };
  if (!investigationCase.entities.some((entity) => entity.id === sourceId) || !investigationCase.entities.some((entity) => entity.id === targetId)) {
    return { investigationCase, created: false, message: 'Одна из соединяемых карточек не найдена.' };
  }
  const duplicate = investigationCase.relations.find((relation) => relation.sourceId === sourceId && relation.targetId === targetId && normalizeIdentityText(relation.label) === 'связано');
  if (duplicate) return { investigationCase, relation: duplicate, created: false, message: 'Такая ручная связь уже существует.' };
  const relation: InvestigationRelation = {
    id: relationId,
    sourceId,
    targetId,
    label: 'связано',
    explanation: 'Связь добавлена перетаскиванием и требует уточнения и проверки источниками.',
    status: 'user_asserted',
    confidence: 0.5,
    sourceIds: [],
    createdBy: 'user',
  };
  return { investigationCase: { ...investigationCase, relations: [...investigationCase.relations, relation] }, relation, created: true };
}

export function isEntityVisible(entity: InvestigationEntity, visibleTypes: ReadonlySet<EntityType>, search: string): boolean {
  if (!visibleTypes.has(entity.type)) return false;
  if (!search) return true;
  return `${entity.title} ${entity.subtitle} ${entity.summary}`.toLowerCase().includes(search.toLowerCase());
}

export function removeEntityFromCase(investigationCase: InvestigationCase, entityId: string): InvestigationCase {
  return normalizeCaseSubject({
    ...investigationCase,
    entities: investigationCase.entities.filter((entity) => entity.id !== entityId),
    relations: investigationCase.relations.filter((relation) => relation.sourceId !== entityId && relation.targetId !== entityId),
    defaultSubjectEntityId: investigationCase.defaultSubjectEntityId === entityId ? undefined : investigationCase.defaultSubjectEntityId,
    researchSubjectEntityId: investigationCase.researchSubjectEntityId === entityId ? undefined : investigationCase.researchSubjectEntityId,
  });
}

export function mergeResearchResult(
  investigationCase: InvestigationCase,
  focusEntity: InvestigationEntity,
  result: ResearchResult,
): InvestigationCase {
  return mergeResearchResultWithOutcome(investigationCase, focusEntity, result).investigationCase;
}

export function mergeResearchResultWithOutcome(
  investigationCase: InvestigationCase,
  focusEntity: InvestigationEntity,
  result: ResearchResult,
): ResearchMergeOutcome {
  const sourceAliases = new Map<string, string>();
  const existingSourcesById = new Map(investigationCase.sources.map((source) => [source.id, source]));
  const existingSourcesByUrl = new Map(investigationCase.sources.map((source) => [sourceIdentityKey(source.url), source]));
  const candidateSourcesById = new Map<string, ResearchResult['sources'][number]>();
  const candidateSourcesByUrl = new Map<string, ResearchResult['sources'][number]>();

  for (const source of result.sources) {
    const existing = existingSourcesById.get(source.id) ?? existingSourcesByUrl.get(sourceIdentityKey(source.url));
    const duplicateCandidate = candidateSourcesById.get(source.id) ?? candidateSourcesByUrl.get(sourceIdentityKey(source.url));
    const canonical = existing ?? duplicateCandidate;
    if (canonical) {
      sourceAliases.set(source.id, canonical.id);
      continue;
    }
    sourceAliases.set(source.id, source.id);
    candidateSourcesById.set(source.id, source);
    candidateSourcesByUrl.set(sourceIdentityKey(source.url), source);
  }

  const existingEntityIds = new Set(investigationCase.entities.map((entity) => entity.id));
  const existingEntitiesByIdentity = new Map(investigationCase.entities.map((entity) => [entityIdentityKey(entity), entity]));
  const entityAliases = new Map<string, string>();
  const candidateEntities: ResearchResult['candidateEntities'] = [];
  const candidateEntitiesByIdentity = new Map<string, ResearchResult['candidateEntities'][number]>();

  for (const entity of result.candidateEntities) {
    const existing = investigationCase.entities.find((item) => item.id === entity.id) ?? existingEntitiesByIdentity.get(entityIdentityKey(entity));
    const duplicateCandidate = candidateEntitiesByIdentity.get(entityIdentityKey(entity));
    const canonical = existing ?? duplicateCandidate;
    if (canonical) {
      entityAliases.set(entity.id, canonical.id);
      continue;
    }
    entityAliases.set(entity.id, entity.id);
    candidateEntities.push(entity);
    candidateEntitiesByIdentity.set(entityIdentityKey(entity), entity);
  }

  const requestedAttributesByEntity = new Map<string, ResearchEntityAttribute[]>();
  const collectAttributes = (entityId: string, attributes: ResearchEntityAttribute[]) => {
    const canonicalId = entityAliases.get(entityId) ?? entityId;
    if (!existingEntityIds.has(canonicalId) || attributes.length === 0) return;
    requestedAttributesByEntity.set(canonicalId, [...(requestedAttributesByEntity.get(canonicalId) ?? []), ...attributes]);
  };
  for (const update of result.entityUpdates ?? []) collectAttributes(update.entityId, update.attributes);
  for (const candidate of result.candidateEntities) {
    if ((entityAliases.get(candidate.id) ?? candidate.id) !== candidate.id) collectAttributes(candidate.id, candidate.attributes ?? []);
  }

  const entityAttributeUpdates = new Map<string, EntityAttribute[]>();
  let addedAttributeCount = 0;
  for (const [entityId, requested] of requestedAttributesByEntity) {
    const entity = investigationCase.entities.find((item) => item.id === entityId);
    if (!entity) continue;
    const attributes = [...(entity.attributes ?? [])];
    const identities = new Set(attributes.map(attributeIdentityKey));
    for (const rawAttribute of requested) {
      const attribute = remapResearchAttribute(rawAttribute, sourceAliases);
      const identity = attributeIdentityKey(attribute);
      if (!attribute.value.trim() || identities.has(identity)) continue;
      identities.add(identity);
      attributes.push(toEntityAttribute(entityId, attribute));
      addedAttributeCount += 1;
    }
    if (attributes.length !== (entity.attributes ?? []).length) entityAttributeUpdates.set(entityId, attributes);
  }

  const validIds = new Set([...existingEntityIds, ...candidateEntities.map((entity) => entity.id)]);
  const existingRelationsById = new Map(investigationCase.relations.map((relation) => [relation.id, relation]));
  const existingRelationsByIdentity = new Map(investigationCase.relations.map((relation) => [relationIdentityKey(relation.sourceId, relation.targetId, relation.label, relation.occurredAt), relation]));
  const acceptedClaims: ResearchResult['claims'] = [];
  const acceptedClaimsByIdentity = new Map<string, ResearchResult['claims'][number]>();
  const relationUpdates = new Map<string, InvestigationRelation>();

  for (const rawClaim of result.claims) {
    const claim = {
      ...rawClaim,
      subjectId: entityAliases.get(rawClaim.subjectId) ?? rawClaim.subjectId,
      objectId: entityAliases.get(rawClaim.objectId) ?? rawClaim.objectId,
      sourceIds: [...new Set(rawClaim.sourceIds.map((sourceId) => sourceAliases.get(sourceId) ?? sourceId))],
    };
    if (!validIds.has(claim.subjectId) || !validIds.has(claim.objectId)) continue;
    const identity = relationIdentityKey(claim.subjectId, claim.objectId, claim.predicate, claim.occurredAt);
    const existing = existingRelationsById.get(claim.id) ?? existingRelationsByIdentity.get(identity);
    if (existing) {
      const sourceIds = [...new Set([...existing.sourceIds, ...claim.sourceIds])];
      if (sourceIds.length !== existing.sourceIds.length) {
        relationUpdates.set(existing.id, {
          ...existing,
          sourceIds,
          ...(claim.confidence > existing.confidence ? { confidence: claim.confidence, status: claim.status, explanation: claim.explanation } : {}),
          occurredAt: existing.occurredAt ?? (claim.occurredAt || undefined),
        });
      }
      continue;
    }
    const duplicateClaim = acceptedClaimsByIdentity.get(identity);
    if (duplicateClaim) {
      duplicateClaim.sourceIds = [...new Set([...duplicateClaim.sourceIds, ...claim.sourceIds])];
      continue;
    }
    acceptedClaims.push(claim);
    acceptedClaimsByIdentity.set(identity, claim);
  }

  const acceptedEntities = candidateEntities
    .map((entity, index): InvestigationEntity => ({
      ...entity,
      attributes: uniqueResearchAttributes((entity.attributes ?? []).map((attribute) => remapResearchAttribute(attribute, sourceAliases)))
        .map((attribute) => toEntityAttribute(entity.id, attribute)),
      position: {
        x: focusEntity.position.x + 290 + (index % 2) * 250,
        y: focusEntity.position.y - 100 + Math.floor(index / 2) * 220,
      },
      facts: [],
      sourceIds: [...new Set(acceptedClaims
        .filter((claim) => claim.subjectId === entity.id || claim.objectId === entity.id)
        .flatMap((claim) => claim.sourceIds))],
      createdBy: 'ai',
      occurredAt: entity.occurredAt || undefined,
    }));

  const acceptedRelations = acceptedClaims
    .map((claim): InvestigationRelation => ({
      id: claim.id,
      sourceId: claim.subjectId,
      targetId: claim.objectId,
      label: claim.predicate,
      explanation: claim.explanation,
      status: claim.status,
      confidence: claim.confidence,
      sourceIds: claim.sourceIds,
      createdBy: 'ai',
      occurredAt: claim.occurredAt || undefined,
    }));

  addedAttributeCount += acceptedEntities.reduce((count, entity) => count + (entity.attributes?.length ?? 0), 0);
  const usedSourceIds = new Set([
    ...acceptedClaims.flatMap((claim) => claim.sourceIds),
    ...[...relationUpdates.values()].flatMap((relation) => relation.sourceIds),
    ...[...entityAttributeUpdates.values()].flatMap((attributes) => attributes.flatMap((attribute) => attribute.sourceIds)),
    ...acceptedEntities.flatMap((entity) => (entity.attributes ?? []).flatMap((attribute) => attribute.sourceIds)),
  ]);
  const acceptedSources = [...candidateSourcesById.values()].filter((source) => usedSourceIds.has(source.id));
  const currentFocus = investigationCase.entities.find((entity) => entity.id === focusEntity.id) ?? focusEntity;
  const existingQuestions = new Set([
    ...currentFocus.facts.filter((fact) => fact.kind === 'question').map((fact) => normalizeIdentityText(fact.text)),
    ...candidateEntities.filter((entity) => entity.type === 'question').map((entity) => normalizeIdentityText(entity.title)),
    ...investigationCase.relations.flatMap((relation) => {
      if (relation.sourceId !== currentFocus.id && relation.targetId !== currentFocus.id) return [];
      const counterpartId = relation.sourceId === currentFocus.id ? relation.targetId : relation.sourceId;
      const counterpart = investigationCase.entities.find((entity) => entity.id === counterpartId && entity.type === 'question');
      return counterpart ? [normalizeIdentityText(counterpart.title)] : [];
    }),
  ]);
  const questionKeys = new Set<string>();
  const acceptedQuestions = result.questions.filter((question) => {
    const key = normalizeIdentityText(question.text);
    if (!key || existingQuestions.has(key) || questionKeys.has(key)) return false;
    questionKeys.add(key);
    return true;
  });
  const warningKeys = new Set<string>();
  const acceptedWarnings = result.warnings.filter((warning) => {
    const key = normalizeIdentityText(warning);
    if (!key || warningKeys.has(key)) return false;
    warningKeys.add(key);
    return true;
  });
  const hasNewInformation = acceptedEntities.length > 0 || acceptedRelations.length > 0 || acceptedSources.length > 0 || relationUpdates.size > 0 || acceptedQuestions.length > 0 || addedAttributeCount > 0;
  const deduplicatedResult: ResearchResult = {
    ...result,
    summary: hasNewInformation ? result.summary : 'Новых сведений по сравнению с материалами дела не найдено.',
    candidateEntities,
    entityUpdates: [...entityAttributeUpdates].map(([entityId, attributes]) => ({
      entityId,
      attributes: attributes.filter((attribute) => !(investigationCase.entities.find((entity) => entity.id === entityId)?.attributes ?? []).some((existing) => attributeIdentityKey(existing) === attributeIdentityKey(attribute))),
    })),
    claims: acceptedClaims,
    questions: acceptedQuestions,
    sources: acceptedSources,
    warnings: acceptedWarnings,
  };

  const acceptedQuestionEntities = acceptedQuestions.map((question, index): InvestigationEntity => {
    const hash = stableTextHash(`${focusEntity.id}:${normalizeIdentityText(question.text)}`);
    return {
      id: `question-ai-${hash}`,
      type: 'question',
      title: question.text,
      subtitle: question.priority === 'high' ? 'Высокий приоритет' : question.priority === 'medium' ? 'Средний приоритет' : 'Низкий приоритет',
      summary: question.why,
      position: { x: focusEntity.position.x - 260 + (index % 3) * 240, y: focusEntity.position.y + 230 + Math.floor(index / 3) * 190 },
      facts: [],
      attributes: [],
      sourceIds: [],
      createdBy: 'ai',
    };
  });
  const acceptedQuestionRelations = acceptedQuestionEntities.map((entity, index): InvestigationRelation => ({
    id: `relation-${entity.id}`,
    sourceId: focusEntity.id,
    targetId: entity.id,
    label: 'требует проверки',
    explanation: acceptedQuestions[index].why || 'Вопрос сформирован в ходе исследования.',
    status: 'unknown',
    confidence: 0,
    sourceIds: [],
    createdBy: 'ai',
  }));
  const mergedCase = {
    ...investigationCase,
    entities: [
      ...investigationCase.entities.map((entity) => {
        const attributes = entityAttributeUpdates.get(entity.id);
        return attributes ? { ...entity, attributes } : entity;
      }),
      ...acceptedEntities,
      ...acceptedQuestionEntities,
    ],
    relations: [
      ...investigationCase.relations.map((relation) => relationUpdates.get(relation.id) ?? relation),
      ...acceptedRelations,
      ...acceptedQuestionRelations,
    ],
    sources: [...investigationCase.sources, ...acceptedSources],
  };
  return {
    investigationCase: mergedCase,
    result: deduplicatedResult,
    addedEntityCount: acceptedEntities.length,
    addedRelationCount: acceptedRelations.length,
    addedSourceCount: acceptedSources.length,
    addedQuestionCount: acceptedQuestions.length,
    updatedRelationCount: relationUpdates.size,
    addedAttributeCount,
    updatedEntityCount: entityAttributeUpdates.size,
    hasNewInformation,
  };
}

function remapResearchAttribute(attribute: ResearchEntityAttribute, sourceAliases: Map<string, string>): ResearchEntityAttribute {
  return { ...attribute, sourceIds: [...new Set(attribute.sourceIds.map((sourceId) => sourceAliases.get(sourceId) ?? sourceId))] };
}

function uniqueResearchAttributes(attributes: ResearchEntityAttribute[]): ResearchEntityAttribute[] {
  const identities = new Set<string>();
  return attributes.filter((attribute) => {
    const identity = attributeIdentityKey(attribute);
    if (!attribute.value.trim() || identities.has(identity)) return false;
    identities.add(identity);
    return true;
  });
}

function toEntityAttribute(entityId: string, attribute: ResearchEntityAttribute): EntityAttribute {
  return {
    ...attribute,
    id: `attribute-${stableTextHash(`${entityId}:${attributeIdentityKey(attribute)}`)}`,
    createdBy: 'ai',
  };
}

function entityIdentityKey(entity: Pick<InvestigationEntity, 'type' | 'title'>): string {
  return `${entity.type}:${normalizeIdentityText(entity.title)}`;
}

function relationIdentityKey(sourceId: string, targetId: string, label: string, occurredAt?: string): string {
  return `${sourceId}>${targetId}:${normalizeIdentityText(label)}:${occurredAt?.trim() ?? ''}`;
}

function sourceIdentityKey(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname}${url.search}`;
  } catch {
    return normalizeIdentityText(value);
  }
}

function normalizeIdentityText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function stableTextHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
