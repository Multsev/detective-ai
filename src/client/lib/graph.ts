import type { CaseChange, EntityAttribute, EntityType, InvestigationCase, InvestigationEntity, InvestigationRelation, QuestionDetails, ResearchEntityAttribute, ResearchResult, SourceReference } from '../../shared/domain';
import { normalizeCaseSubject } from '../../shared/caseSubject';
import { attributeIdentityKey } from '../../shared/entityAttributeCatalog';
import { getQuestionDetails, normalizeCaseQuestions } from '../../shared/questions';
import { appendCaseChanges, buildCaseChanges } from '../../shared/caseChanges';
import { refreshSourceReference } from '../../shared/sourceFreshness';

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
  updatedSourceCount: number;
  changes: CaseChange[];
  hasNewInformation: boolean;
}

export interface InteractiveRelationResult {
  investigationCase: InvestigationCase;
  relation?: InvestigationRelation;
  created: boolean;
  message?: string;
}

export interface QuestionResolutionMergeOutcome extends ResearchMergeOutcome {
  question: QuestionDetails;
}

export function mergeQuestionResolutionResult(
  investigationCase: InvestigationCase,
  questionEntity: InvestigationEntity,
  result: ResearchResult,
  researchRunId: string,
): QuestionResolutionMergeOutcome {
  const base = mergeResearchResultWithOutcome(investigationCase, questionEntity, result, researchRunId);
  const proposal = result.questionResolution;
  const current = getQuestionDetails(questionEntity, investigationCase);
  if (!current) throw new Error('Карточка вопроса не найдена.');

  const sourceIds = [...new Set((proposal?.sourceIds ?? []).flatMap((id) => {
    if (base.investigationCase.sources.some((source) => source.id === id)) return [id];
    const proposed = result.sources.find((source) => source.id === id);
    const canonical = proposed && base.investigationCase.sources.find((source) => sourceIdentityKey(source.url) === sourceIdentityKey(proposed.url));
    return canonical ? [canonical.id] : [];
  }))];
  const proposalClaims = new Map(result.claims.map((claim) => [claim.id, claim]));
  const resolvedRelations = (proposal?.resolvedClaimIds ?? []).flatMap((claimId) => {
    const direct = base.investigationCase.relations.find((relation) => relation.id === claimId);
    if (direct) return [direct];
    const claim = proposalClaims.get(claimId);
    if (!claim) return [];
    const match = base.investigationCase.relations.find((relation) =>
      relation.sourceId === claim.subjectId
      && relation.targetId === claim.objectId
      && normalizeIdentityText(relation.label) === normalizeIdentityText(claim.predicate)
      && (relation.occurredAt ?? '') === (claim.occurredAt ?? ''));
    return match ? [match] : [];
  });
  const answer = proposal?.answer.trim() ?? '';
  const hasEvidence = sourceIds.length > 0 && resolvedRelations.length > 0;
  const status: QuestionDetails['status'] = proposal?.outcome === 'contradicted' && sourceIds.length
    ? 'contradicted'
    : proposal?.outcome === 'answered' && answer && hasEvidence
      ? 'answered'
      : answer && sourceIds.length
        ? 'partial'
        : 'blocked';
  const now = new Date().toISOString();
  const question: QuestionDetails = {
    ...current,
    status,
    answer: answer || current.answer,
    answerSourceIds: [...new Set([...current.answerSourceIds, ...sourceIds])],
    researchRunIds: [...new Set([...current.researchRunIds, researchRunId])],
    resolvedByRelationIds: [...new Set([...current.resolvedByRelationIds, ...resolvedRelations.map((relation) => relation.id)])],
    resolvedByEntityIds: [...new Set([...current.resolvedByEntityIds, ...resolvedRelations.flatMap((relation) => [relation.sourceId, relation.targetId]).filter((id) => id !== questionEntity.id)])],
    resolvedAt: status === 'answered' ? now : undefined,
  };
  const resolvedCase = {
    ...base.investigationCase,
    entities: base.investigationCase.entities.map((entity) => entity.id === questionEntity.id ? { ...entity, question } : entity),
  };
  const questionChanges = buildCaseChanges(base.investigationCase, resolvedCase, researchRunId, now);
  return {
    ...base,
    investigationCase: appendCaseChanges(resolvedCase, questionChanges),
    changes: [...base.changes, ...questionChanges],
    question,
  };
}

export function answerQuestionManually(
  investigationCase: InvestigationCase,
  questionId: string,
  answer: string,
  sourceId: string,
  targetId: string,
  label: string,
): InvestigationCase {
  const questionEntity = investigationCase.entities.find((entity) => entity.id === questionId);
  const current = questionEntity ? getQuestionDetails(questionEntity, investigationCase) : undefined;
  if (!questionEntity || !current) throw new Error('Карточка вопроса не найдена.');
  if (!answer.trim() || !label.trim()) throw new Error('Укажите ответ и смысл связи.');
  if (sourceId === targetId || !investigationCase.entities.some((entity) => entity.id === sourceId) || !investigationCase.entities.some((entity) => entity.id === targetId)) {
    throw new Error('Выберите две разные существующие карточки.');
  }
  const identity = relationIdentityKey(sourceId, targetId, label, '');
  const existing = investigationCase.relations.find((relation) => relationIdentityKey(relation.sourceId, relation.targetId, relation.label, relation.occurredAt) === identity);
  const relation: InvestigationRelation = existing ?? {
    id: `relation-manual-${stableTextHash(`${questionId}:${sourceId}:${targetId}:${label}`)}`,
    sourceId,
    targetId,
    label: label.trim(),
    explanation: `Ручной ответ на вопрос: ${answer.trim()}`,
    status: 'user_asserted',
    confidence: 0.5,
    sourceIds: [],
    createdBy: 'user',
  };
  const now = new Date().toISOString();
  const question: QuestionDetails = {
    ...current,
    status: 'answered',
    answer: answer.trim(),
    resolvedByRelationIds: [...new Set([...current.resolvedByRelationIds, relation.id])],
    resolvedByEntityIds: [...new Set([...current.resolvedByEntityIds, sourceId, targetId])],
    resolvedAt: now,
  };
  return {
    ...investigationCase,
    entities: investigationCase.entities.map((entity) => entity.id === questionId ? { ...entity, question } : entity),
    relations: existing ? investigationCase.relations : [...investigationCase.relations, relation],
  };
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

export function isEntityVisible(entity: InvestigationEntity, visibleTypes: ReadonlySet<EntityType>, search: string, visibleQuestionStatuses?: ReadonlySet<QuestionDetails['status']>): boolean {
  if (!visibleTypes.has(entity.type)) return false;
  if (entity.type === 'question' && visibleQuestionStatuses && !visibleQuestionStatuses.has(entity.question?.status ?? 'open')) return false;
  if (!search) return true;
  return `${entity.title} ${entity.subtitle} ${entity.summary}`.toLowerCase().includes(search.toLowerCase());
}

export function removeEntityFromCase(investigationCase: InvestigationCase, entityId: string): InvestigationCase {
  return normalizeCaseSubject({
    ...investigationCase,
    entities: investigationCase.entities.filter((entity) => entity.id !== entityId),
    relations: investigationCase.relations.filter((relation) => relation.sourceId !== entityId && relation.targetId !== entityId),
    materials: (investigationCase.materials ?? []).filter((material) => material.entityId !== entityId),
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
  researchRunId?: string,
): ResearchMergeOutcome {
  const sourceAliases = new Map<string, string>();
  const existingSourcesById = new Map(investigationCase.sources.map((source) => [source.id, source]));
  const existingSourcesByUrl = new Map(investigationCase.sources.map((source) => [sourceIdentityKey(source.url), source]));
  const candidateSourcesById = new Map<string, ResearchResult['sources'][number]>();
  const candidateSourcesByUrl = new Map<string, ResearchResult['sources'][number]>();
  const sourceUpdates = new Map<string, SourceReference>();

  for (const source of result.sources) {
    const existing = existingSourcesById.get(source.id) ?? existingSourcesByUrl.get(sourceIdentityKey(source.url));
    const duplicateCandidate = candidateSourcesById.get(source.id) ?? candidateSourcesByUrl.get(sourceIdentityKey(source.url));
    const canonical = existing ?? duplicateCandidate;
    if (canonical) {
      sourceAliases.set(source.id, canonical.id);
      if (existing) {
        const previousCheck = (existing.lastCheckedAt || existing.accessedAt).slice(0, 10);
        const metadataChanged = Boolean(source.publishedAt && source.publishedAt !== existing.publishedAt)
          || (!existing.title && Boolean(source.title)) || (!existing.publisher && Boolean(source.publisher));
        if (metadataChanged || source.accessedAt > previousCheck) {
          const refreshedInput = metadataChanged ? { ...source, id: existing.id, url: existing.url } : { ...existing, accessedAt: source.accessedAt };
          sourceUpdates.set(existing.id, refreshSourceReference(existing, refreshedInput, source.accessedAt));
        }
      }
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
      const shouldRefreshEvidence = sourceIds.length !== existing.sourceIds.length
        || claim.confidence > existing.confidence
        || (claim.status === 'contradicted' && existing.status !== 'contradicted')
        || (!existing.occurredAt && Boolean(claim.occurredAt));
      if (shouldRefreshEvidence) {
        relationUpdates.set(existing.id, {
          ...existing,
          sourceIds,
          ...(claim.confidence > existing.confidence || claim.status === 'contradicted' ? { confidence: claim.confidence, status: claim.status, explanation: claim.explanation } : {}),
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
    ...(result.questionResolution?.sourceIds ?? []).map((sourceId) => sourceAliases.get(sourceId) ?? sourceId),
  ]);
  const acceptedSources = [...candidateSourcesById.values()].filter((source) => usedSourceIds.has(source.id)).map((source) => refreshSourceReference(undefined, source, source.accessedAt));
  const updatedSourceContentCount = [...sourceUpdates].filter(([id, source]) => {
    const previous = existingSourcesById.get(id);
    return previous ? sourceMetadataKey(previous) !== sourceMetadataKey(source) : false;
  }).length;
  const updatedSourceContentIds = new Set([...sourceUpdates].filter(([id, source]) => {
    const previous = existingSourcesById.get(id);
    return previous ? sourceMetadataKey(previous) !== sourceMetadataKey(source) : false;
  }).map(([id]) => id));
  const currentFocus = investigationCase.entities.find((entity) => entity.id === focusEntity.id) ?? focusEntity;
  const questionScope = (ids?: string[]) => [...new Set((ids?.length ? ids : [currentFocus.id]).map((id) => entityAliases.get(id) ?? id).filter((id) => validIds.has(id)))];
  const existingQuestions = new Set([
    ...currentFocus.facts.filter((fact) => fact.kind === 'question').map((fact) => questionIdentityKey(fact.text, [currentFocus.id])),
    ...candidateEntities.filter((entity) => entity.type === 'question').map((entity) => questionIdentityKey(entity.title, [currentFocus.id])),
    ...investigationCase.entities.filter((entity) => entity.type === 'question').map((entity) => questionIdentityKey(entity.title, getQuestionDetails(entity, investigationCase)?.aboutEntityIds ?? [currentFocus.id])),
  ]);
  const questionKeys = new Set<string>();
  const acceptedQuestions = result.questions.filter((question) => {
    const key = questionIdentityKey(question.text, questionScope(question.aboutEntityIds));
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
  const hasNewInformation = acceptedEntities.length > 0 || acceptedRelations.length > 0 || acceptedSources.length > 0 || relationUpdates.size > 0 || acceptedQuestions.length > 0 || addedAttributeCount > 0 || updatedSourceContentCount > 0;
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
    sources: [...acceptedSources, ...[...sourceUpdates.values()].filter((source) => updatedSourceContentIds.has(source.id))],
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
      question: {
        status: 'open',
        priority: question.priority,
        why: question.why,
        successCriteria: question.successCriteria || 'Найти проверяемый ответ и подтвердить его источником.',
        aboutEntityIds: questionScope(question.aboutEntityIds),
        answerSourceIds: [],
        researchRunIds: [],
        resolvedByEntityIds: [],
        resolvedByRelationIds: [],
        createdAt: new Date().toISOString(),
      },
    };
  });
  const acceptedQuestionRelations = acceptedQuestionEntities.flatMap((entity, index): InvestigationRelation[] => {
    const aboutIds = entity.question?.aboutEntityIds.length ? entity.question.aboutEntityIds : [focusEntity.id];
    return aboutIds.map((aboutId) => ({
      id: `relation-${entity.id}-${stableTextHash(aboutId)}`,
      sourceId: aboutId,
      targetId: entity.id,
      label: 'требует проверки',
      explanation: acceptedQuestions[index].why || 'Вопрос сформирован в ходе исследования.',
      status: 'unknown',
      confidence: 0,
      sourceIds: [],
      createdBy: 'ai',
    }));
  });
  const mergedWithoutChanges = normalizeCaseQuestions({
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
    sources: [...investigationCase.sources.map((source) => sourceUpdates.get(source.id) ?? source), ...acceptedSources],
  });
  const detectedAt = new Date().toISOString();
  const changes = buildCaseChanges(investigationCase, mergedWithoutChanges, researchRunId, detectedAt);
  const mergedCase = appendCaseChanges(mergedWithoutChanges, changes);
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
    updatedSourceCount: sourceUpdates.size,
    changes,
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

function questionIdentityKey(text: string, aboutEntityIds: readonly string[]): string {
  return `${normalizeIdentityText(text)}::${[...new Set(aboutEntityIds)].sort().join(',')}`;
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

function sourceMetadataKey(source: Pick<SourceReference, 'title' | 'url' | 'publisher' | 'publishedAt'>): string {
  return [source.title, source.url, source.publisher, source.publishedAt].join('\u0000');
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
