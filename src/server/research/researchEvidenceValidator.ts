import type { InvestigationCase, ResearchResult, SourceReference } from '../../shared/domain.js';

function describeMissing(values: string[]): string {
  return [...new Set(values)].join(', ');
}

/** Rejects structurally valid JSON that would still create an untraceable graph. */
export function validateResearchEvidence(
  result: ResearchResult,
  investigationCase: InvestigationCase,
  additionalSources: SourceReference[] = [],
): void {
  const sourceIds = new Set([
    ...investigationCase.sources.map((source) => source.id),
    ...additionalSources.map((source) => source.id),
    ...result.sources.map((source) => source.id),
  ]);
  const entityIds = new Set([
    ...investigationCase.entities.map((entity) => entity.id),
    ...result.candidateEntities.map((entity) => entity.id),
  ]);
  const errors: string[] = [];

  for (const update of result.entityUpdates ?? []) {
    if (!investigationCase.entities.some((entity) => entity.id === update.entityId)) errors.push(`обновление ссылается на неизвестную карточку ${update.entityId}`);
    for (const attribute of update.attributes) {
      const missing = attribute.sourceIds.filter((sourceId) => !sourceIds.has(sourceId));
      if (missing.length) errors.push(`реквизит ${attribute.key} ссылается на неизвестные источники ${describeMissing(missing)}`);
    }
  }
  for (const entity of result.candidateEntities) {
    for (const attribute of entity.attributes ?? []) {
      const missing = attribute.sourceIds.filter((sourceId) => !sourceIds.has(sourceId));
      if (missing.length) errors.push(`реквизит ${entity.id}.${attribute.key} ссылается на неизвестные источники ${describeMissing(missing)}`);
    }
  }
  for (const claim of result.claims) {
    if (!entityIds.has(claim.subjectId) || !entityIds.has(claim.objectId)) errors.push(`связь ${claim.id} имеет неизвестный конец`);
    if (!['unknown', 'hypothesis'].includes(claim.status) && claim.sourceIds.length === 0) errors.push(`подтверждаемая связь ${claim.id} не имеет источника`);
    const missing = claim.sourceIds.filter((sourceId) => !sourceIds.has(sourceId));
    if (missing.length) errors.push(`связь ${claim.id} ссылается на неизвестные источники ${describeMissing(missing)}`);
  }
  if (result.questionResolution) {
    const missing = result.questionResolution.sourceIds.filter((sourceId) => !sourceIds.has(sourceId));
    if (missing.length) errors.push(`ответ на вопрос ссылается на неизвестные источники ${describeMissing(missing)}`);
  }

  if (errors.length) throw new Error(`Codex вернул непроверяемый граф: ${errors.slice(0, 8).join('; ')}.`);
}
