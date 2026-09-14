import type { CaseMaterial, InvestigationCase, ResearchRun } from './domain.js';
import { normalizeSourceFreshness } from './sourceFreshness.js';

export function normalizeResearchMemory(investigationCase: InvestigationCase): InvestigationCase {
  return {
    ...investigationCase,
    materials: Array.isArray(investigationCase.materials) ? investigationCase.materials : [],
    sources: investigationCase.sources.map(normalizeSourceFreshness),
    researchRuns: Array.isArray(investigationCase.researchRuns) ? investigationCase.researchRuns.map((run) => ({
      ...run,
      changeIds: Array.isArray(run.changeIds) ? run.changeIds : [],
      sourceCoverage: Array.isArray(run.sourceCoverage) ? run.sourceCoverage : [],
      activity: Array.isArray(run.activity) ? run.activity : [],
    })) : [],
    changes: Array.isArray(investigationCase.changes) ? investigationCase.changes : [],
  };
}

export function getEntityMaterials(investigationCase: InvestigationCase, entityId: string): CaseMaterial[] {
  return (investigationCase.materials ?? []).filter((material) => material.entityId === entityId);
}

export function getPendingEntityMaterials(investigationCase: InvestigationCase, entityId: string): CaseMaterial[] {
  return getEntityMaterials(investigationCase, entityId).filter((material) => (
    material.status === 'pending'
    || material.status === 'changed'
    || material.status === 'error'
    || material.processedRevision !== material.revision
  ));
}

export function getEntityResearchRuns(investigationCase: InvestigationCase, entityId: string): ResearchRun[] {
  return (investigationCase.researchRuns ?? [])
    .filter((run) => run.entityIds.includes(entityId))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}
