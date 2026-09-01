import type { EntityType, InvestigationCase, InvestigationEntity, InvestigationRelation, ResearchResult } from '../../shared/domain';
import { normalizeCaseSubject } from '../../shared/caseSubject';

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
  const existingEntityIds = new Set(investigationCase.entities.map((entity) => entity.id));
  const candidateEntities = result.candidateEntities.filter((entity) => !existingEntityIds.has(entity.id));
  const validIds = new Set([...existingEntityIds, ...candidateEntities.map((entity) => entity.id)]);
  const acceptedClaims = result.claims.filter((claim) => validIds.has(claim.subjectId) && validIds.has(claim.objectId));
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
    }));

  const existingRelationIds = new Set(investigationCase.relations.map((relation) => relation.id));
  const acceptedRelations = acceptedClaims
    .filter((claim) => !existingRelationIds.has(claim.id))
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
    }));

  const existingSourceIds = new Set(investigationCase.sources.map((source) => source.id));
  const acceptedSources = result.sources.filter((source) => !existingSourceIds.has(source.id));

  return {
    ...investigationCase,
    entities: [...investigationCase.entities, ...acceptedEntities],
    relations: [...investigationCase.relations, ...acceptedRelations],
    sources: [...investigationCase.sources, ...acceptedSources],
  };
}
