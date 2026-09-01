import type { EntityType, InvestigationCase, InvestigationEntity, InvestigationRelation, ResearchResult } from '../../shared/domain';
import { normalizeCaseSubject } from '../../shared/caseSubject';

export interface ResearchMergeOutcome {
  investigationCase: InvestigationCase;
  result: ResearchResult;
  addedEntityCount: number;
  addedRelationCount: number;
  addedSourceCount: number;
  addedQuestionCount: number;
  updatedRelationCount: number;
  hasNewInformation: boolean;
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

  const usedSourceIds = new Set([
    ...acceptedClaims.flatMap((claim) => claim.sourceIds),
    ...[...relationUpdates.values()].flatMap((relation) => relation.sourceIds),
  ]);
  const acceptedSources = [...candidateSourcesById.values()].filter((source) => usedSourceIds.has(source.id));
  const currentFocus = investigationCase.entities.find((entity) => entity.id === focusEntity.id) ?? focusEntity;
  const existingQuestions = new Set(currentFocus.facts.filter((fact) => fact.kind === 'question').map((fact) => normalizeIdentityText(fact.text)));
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
  const hasNewInformation = acceptedEntities.length > 0 || acceptedRelations.length > 0 || acceptedSources.length > 0 || relationUpdates.size > 0 || acceptedQuestions.length > 0;
  const deduplicatedResult: ResearchResult = {
    ...result,
    summary: hasNewInformation ? result.summary : 'Новых сведений по сравнению с материалами дела не найдено.',
    candidateEntities,
    claims: acceptedClaims,
    questions: acceptedQuestions,
    sources: acceptedSources,
    warnings: acceptedWarnings,
  };

  const acceptedQuestionFacts = acceptedQuestions.map((question) => ({
    id: `question-ai-${stableTextHash(normalizeIdentityText(question.text))}`,
    kind: 'question' as const,
    text: question.text,
    status: 'unknown' as const,
    confidence: 0,
    sourceIds: [],
    createdBy: 'ai' as const,
  }));
  const mergedCase = {
    ...investigationCase,
    entities: [
      ...investigationCase.entities.map((entity) => entity.id === focusEntity.id && acceptedQuestionFacts.length > 0
        ? { ...entity, facts: [...entity.facts, ...acceptedQuestionFacts] }
        : entity),
      ...acceptedEntities,
    ],
    relations: [
      ...investigationCase.relations.map((relation) => relationUpdates.get(relation.id) ?? relation),
      ...acceptedRelations,
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
    hasNewInformation,
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
