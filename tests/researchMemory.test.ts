import { describe, expect, it } from 'vitest';
import type { CaseMaterial } from '../src/shared/domain';
import { createSeedCase } from '../src/shared/seed';
import { getEntityMaterials, getEntityResearchRuns, getPendingEntityMaterials, normalizeResearchMemory } from '../src/shared/researchMemory';

function material(status: CaseMaterial['status'], revision = 1, processedRevision?: number): CaseMaterial {
  return {
    id: `material-${status}`,
    entityId: 'ivan-morozov',
    kind: 'note',
    name: status,
    mimeType: 'text/markdown',
    fingerprint: status,
    content: status,
    size: status.length,
    revision,
    status,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    processedRevision,
  };
}

describe('research memory', () => {
  it('migrates a legacy case to empty material and run collections', () => {
    const legacy = createSeedCase();
    delete legacy.materials;
    delete legacy.researchRuns;
    expect(normalizeResearchMemory(legacy)).toMatchObject({ materials: [], researchRuns: [] });
  });

  it('selects only new, changed, failed or newer material revisions', () => {
    const investigationCase = {
      ...createSeedCase(),
      materials: [material('pending'), material('changed', 2, 1), material('error'), material('processed', 1, 1)],
    };
    expect(getEntityMaterials(investigationCase, 'ivan-morozov')).toHaveLength(4);
    expect(getPendingEntityMaterials(investigationCase, 'ivan-morozov').map((item) => item.status)).toEqual(['pending', 'changed', 'error']);
  });

  it('returns latest entity runs first', () => {
    const investigationCase = {
      ...createSeedCase(),
      researchRuns: [
        { id: 'old', mode: 'information' as const, entityIds: ['ivan-morozov'], question: '', includeWeb: true, status: 'completed' as const, startedAt: '2026-08-01', inputMaterials: [], checkedUrls: [], attemptedQueries: [], nextSteps: [], addedEntityIds: [], addedRelationIds: [], summary: '' },
        { id: 'new', mode: 'information' as const, entityIds: ['ivan-morozov'], question: '', includeWeb: true, status: 'completed' as const, startedAt: '2026-09-01', inputMaterials: [], checkedUrls: [], attemptedQueries: [], nextSteps: [], addedEntityIds: [], addedRelationIds: [], summary: '' },
      ],
    };
    expect(getEntityResearchRuns(investigationCase, 'ivan-morozov').map((run) => run.id)).toEqual(['new', 'old']);
  });
});
