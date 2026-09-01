import type { InvestigationCase, InvestigationEntity, InvestigationRelation, ResearchResult } from '../../shared/domain';

export function mergeResearchResult(
  investigationCase: InvestigationCase,
  focusEntity: InvestigationEntity,
  result: ResearchResult,
): InvestigationCase {
  const existingEntityIds = new Set(investigationCase.entities.map((entity) => entity.id));
  const acceptedEntities = result.candidateEntities
    .filter((entity) => !existingEntityIds.has(entity.id))
    .map((entity, index): InvestigationEntity => ({
      ...entity,
      position: {
        x: focusEntity.position.x + 290 + (index % 2) * 250,
        y: focusEntity.position.y - 100 + Math.floor(index / 2) * 220,
      },
      facts: [],
    }));

  const validIds = new Set([...existingEntityIds, ...acceptedEntities.map((entity) => entity.id)]);
  const existingRelationIds = new Set(investigationCase.relations.map((relation) => relation.id));
  const acceptedRelations = result.claims
    .filter((claim) => validIds.has(claim.subjectId) && validIds.has(claim.objectId) && !existingRelationIds.has(claim.id))
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
