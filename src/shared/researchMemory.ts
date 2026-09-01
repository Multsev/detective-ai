import type { CaseMaterial, InvestigationCase, ResearchRun } from './domain.js';

export function normalizeResearchMemory(investigationCase: InvestigationCase): InvestigationCase {
  return {
    ...investigationCase,
    materials: Array.isArray(investigationCase.materials) ? investigationCase.materials : [],
    researchRuns: Array.isArray(investigationCase.researchRuns) ? investigationCase.researchRuns : [],
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
