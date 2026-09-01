import { describe, expect, it } from 'vitest';
import { mergeResearchResult } from '../src/client/lib/graph.js';
import { createSeedCase } from '../src/shared/seed.js';

describe('research proposal merge', () => {
  it('adds only relations whose endpoints exist', () => {
    const investigationCase = createSeedCase();
    const focus = investigationCase.entities[0];
    const merged = mergeResearchResult(investigationCase, focus, {
      summary: 'Проверка',
      identityAssessment: 'Личность требует дополнительной проверки.',
      candidateEntities: [{ id: 'new-company', type: 'company', title: 'Новая компания', subtitle: '', summary: '' }],
      claims: [
        { id: 'valid', subjectId: focus.id, objectId: 'new-company', predicate: 'связан', status: 'probable', confidence: 0.7, explanation: '', sourceIds: ['source-1'] },
        { id: 'invalid', subjectId: focus.id, objectId: 'missing', predicate: 'невалидная связь', status: 'hypothesis', confidence: 0.2, explanation: '', sourceIds: [] },
      ],
      questions: [],
      warnings: [],
      sources: [{ id: 'source-1', title: 'Источник', url: 'https://example.org', publisher: 'Example', publishedAt: '', accessedAt: '2026-09-01' }],
    });

    expect(merged.entities.some((entity) => entity.id === 'new-company')).toBe(true);
    expect(merged.relations.some((relation) => relation.id === 'valid')).toBe(true);
    expect(merged.relations.some((relation) => relation.id === 'invalid')).toBe(false);
  });

  it('does not duplicate an existing candidate or source', () => {
    const investigationCase = createSeedCase();
    const focus = investigationCase.entities[0];
    const existingSource = investigationCase.sources[0];
    const merged = mergeResearchResult(investigationCase, focus, {
      summary: '', identityAssessment: '', claims: [], questions: [], warnings: [],
      candidateEntities: [{ id: focus.id, type: focus.type, title: focus.title, subtitle: '', summary: '' }],
      sources: [existingSource],
    });

    expect(merged.entities.filter((entity) => entity.id === focus.id)).toHaveLength(1);
    expect(merged.sources.filter((source) => source.id === existingSource.id)).toHaveLength(1);
  });
});
