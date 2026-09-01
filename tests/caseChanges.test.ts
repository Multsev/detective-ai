import { describe, expect, it } from 'vitest';
import { buildCaseChanges, getEntityCaseChanges, getUnreadCaseChanges, markCaseChangesRead } from '../src/shared/caseChanges.js';
import { normalizeResearchMemory } from '../src/shared/researchMemory.js';
import { getSourceFreshness, getSourcesDueForRecheck, refreshSourceReference } from '../src/shared/sourceFreshness.js';
import { createSeedCase } from '../src/shared/seed.js';
import { mergeResearchResultWithOutcome } from '../src/client/lib/graph.js';

describe('case change journal', () => {
  it('migrates old cases, research runs and source freshness fields', () => {
    const seed = createSeedCase();
    const legacy = { ...seed, changes: undefined, researchRuns: [{ id: 'run-old', mode: 'information' as const, entityIds: [seed.entities[0].id], question: '', includeWeb: true, status: 'completed' as const, startedAt: '2026-01-01', inputMaterials: [], checkedUrls: [], attemptedQueries: [], nextSteps: [], addedEntityIds: [], addedRelationIds: [], summary: '' }] };
    const migrated = normalizeResearchMemory(legacy);

    expect(migrated.changes).toEqual([]);
    expect(migrated.researchRuns?.[0].changeIds).toEqual([]);
    expect(migrated.sources[0]).toMatchObject({ checkCount: 1 });
    expect(migrated.sources[0].lastCheckedAt).toBeTruthy();
  });

  it('builds before/after changes and supports unread state per card', () => {
    const before = createSeedCase();
    const entity = before.entities[0];
    const after = { ...before, entities: before.entities.map((item) => item.id === entity.id ? { ...item, summary: 'Обновлённое описание' } : item) };
    const changes = buildCaseChanges(before, after, 'run-1', '2026-09-01T12:00:00.000Z');
    const withChanges = { ...after, changes };

    expect(changes).toContainEqual(expect.objectContaining({ kind: 'entity_updated', researchRunId: 'run-1', entityIds: [entity.id] }));
    expect(getUnreadCaseChanges(withChanges)).toHaveLength(1);
    expect(getEntityCaseChanges(withChanges, entity.id)).toHaveLength(1);
    expect(getUnreadCaseChanges(markCaseChangesRead(withChanges, [changes[0].id]))).toHaveLength(0);
  });

  it('records an update to an existing line and links it to the research run', () => {
    const investigationCase = createSeedCase();
    const relation = investigationCase.relations.find((item) => item.id === 'relation-anna-sergey')!;
    const focus = investigationCase.entities.find((entity) => entity.id === relation.sourceId)!;
    const outcome = mergeResearchResultWithOutcome(investigationCase, focus, {
      summary: 'Связь подтверждена точнее.', identityAssessment: '', candidateEntities: [], entityUpdates: [], questions: [], warnings: [], sources: [], questionResolution: null,
      claims: [{ id: 'same-line', subjectId: relation.sourceId, objectId: relation.targetId, predicate: relation.label, status: 'probable', confidence: 0.91, explanation: 'Получено более сильное подтверждение.', sourceIds: relation.sourceIds, occurredAt: relation.occurredAt ?? '' }],
    }, 'run-line-update');

    expect(outcome.updatedRelationCount).toBe(1);
    expect(outcome.investigationCase.relations.find((item) => item.id === relation.id)).toMatchObject({ confidence: 0.91, status: 'probable' });
    expect(outcome.changes).toContainEqual(expect.objectContaining({ kind: 'relation_updated', targetId: relation.id, researchRunId: 'run-line-update' }));
  });

  it('rechecks a known source without reporting duplicate substantive data', () => {
    const investigationCase = createSeedCase();
    const source = investigationCase.sources[0];
    const focus = investigationCase.entities[0];
    const later = new Date(`${source.accessedAt}T00:00:00.000Z`); later.setUTCDate(later.getUTCDate() + 2);
    const accessedAt = later.toISOString().slice(0, 10);
    const outcome = mergeResearchResultWithOutcome(investigationCase, focus, {
      summary: 'Источник проверен повторно.', identityAssessment: '', candidateEntities: [], entityUpdates: [], claims: [], questions: [], warnings: [], questionResolution: null,
      sources: [{ ...source, id: 'duplicate-id', accessedAt }],
    }, 'run-recheck');

    expect(outcome.hasNewInformation).toBe(false);
    expect(outcome.investigationCase.sources).toHaveLength(investigationCase.sources.length);
    expect(outcome.changes).toContainEqual(expect.objectContaining({ kind: 'source_rechecked', researchRunId: 'run-recheck' }));
  });
});

describe('source freshness', () => {
  it('marks web sources due after the control date and leaves files static', () => {
    const seed = createSeedCase();
    const old = refreshSourceReference(undefined, { ...seed.sources[0], kind: 'web', accessedAt: '2026-01-01' }, '2026-01-01');
    const file = { ...seed.sources[0], id: 'file', kind: 'uploaded_file' as const };
    const investigationCase = { ...seed, sources: [old, file] };

    expect(getSourceFreshness(old, new Date('2026-03-01T00:00:00.000Z'))).toBe('due');
    expect(getSourceFreshness(file, new Date('2027-01-01T00:00:00.000Z'))).toBe('static');
    expect(getSourcesDueForRecheck(investigationCase, new Date('2026-03-01T00:00:00.000Z')).map((source) => source.id)).toEqual([old.id]);
  });
});
