import { describe, expect, it } from 'vitest';
import { isEntityVisible, mergeResearchResult, mergeResearchResultWithOutcome, removeEntityFromCase } from '../src/client/lib/graph.js';
import { createSeedCase } from '../src/shared/seed.js';

describe('research proposal merge', () => {
  it('adds only relations whose endpoints exist', () => {
    const investigationCase = createSeedCase();
    const focus = investigationCase.entities[0];
    const merged = mergeResearchResult(investigationCase, focus, {
      summary: 'Проверка',
      identityAssessment: 'Личность требует дополнительной проверки.',
      candidateEntities: [{ id: 'new-company', type: 'company', title: 'Новая компания', subtitle: '', summary: '', occurredAt: '2024-05' }],
      claims: [
        { id: 'valid', subjectId: focus.id, objectId: 'new-company', predicate: 'связан', status: 'probable', confidence: 0.7, explanation: '', sourceIds: ['source-1'], occurredAt: '2024-05-17' },
        { id: 'invalid', subjectId: focus.id, objectId: 'missing', predicate: 'невалидная связь', status: 'hypothesis', confidence: 0.2, explanation: '', sourceIds: [], occurredAt: '' },
      ],
      questions: [],
      warnings: [],
      sources: [{ id: 'source-1', title: 'Источник', url: 'https://example.org', publisher: 'Example', publishedAt: '', accessedAt: '2026-09-01' }],
    });

    expect(merged.entities.some((entity) => entity.id === 'new-company')).toBe(true);
    expect(merged.entities.find((entity) => entity.id === 'new-company')).toMatchObject({ createdBy: 'ai', sourceIds: ['source-1'], occurredAt: '2024-05' });
    expect(merged.relations.some((relation) => relation.id === 'valid')).toBe(true);
    expect(merged.relations.find((relation) => relation.id === 'valid')).toMatchObject({ occurredAt: '2024-05-17' });
    expect(merged.relations.some((relation) => relation.id === 'invalid')).toBe(false);
  });

  it('does not duplicate an existing candidate or source', () => {
    const investigationCase = createSeedCase();
    const focus = investigationCase.entities[0];
    const existingSource = investigationCase.sources[0];
    const merged = mergeResearchResult(investigationCase, focus, {
      summary: '', identityAssessment: '', claims: [], questions: [], warnings: [],
      candidateEntities: [{ id: focus.id, type: focus.type, title: focus.title, subtitle: '', summary: '', occurredAt: '' }],
      sources: [existingSource],
    });

    expect(merged.entities.filter((entity) => entity.id === focus.id)).toHaveLength(1);
    expect(merged.sources.filter((source) => source.id === existingSource.id)).toHaveLength(1);
  });

  it('removes semantic duplicates even when Codex returns different IDs', () => {
    const investigationCase = createSeedCase();
    const focus = investigationCase.entities[1];
    focus.facts.push({ id: 'existing-question', kind: 'question', text: 'Кто может подтвердить время его ухода?', status: 'unknown', confidence: 0, sourceIds: [], createdBy: 'user' });
    const outcome = mergeResearchResultWithOutcome(investigationCase, focus, {
      summary: 'Повтор ранее найденных сведений.',
      identityAssessment: '',
      candidateEntities: [{ id: 'anna-copy', type: 'person', title: '  АННА   ЛЕБЕДЕВА ', subtitle: 'Журналист', summary: '', occurredAt: '' }],
      claims: [{ id: 'same-link-new-id', subjectId: 'anna-copy', objectId: 'sergey-volkov', predicate: 'ВОЗМОЖНО ВИДЕЛА!', status: 'hypothesis', confidence: 0.35, explanation: '', sourceIds: ['same-url-new-id'], occurredAt: '' }],
      questions: [{ text: 'Кто может подтвердить время его ухода?', why: '', priority: 'high' }],
      warnings: [],
      sources: [{ id: 'same-url-new-id', title: 'Копия', url: 'https://example.com/interview/?utm_source=repeat#fragment', publisher: 'Материалы дела', publishedAt: '2026-08-28', accessedAt: '2026-09-01' }],
    });

    expect(outcome.hasNewInformation).toBe(false);
    expect(outcome.investigationCase.entities).toHaveLength(investigationCase.entities.length);
    expect(outcome.investigationCase.relations).toHaveLength(investigationCase.relations.length);
    expect(outcome.investigationCase.sources).toHaveLength(investigationCase.sources.length);
    expect(outcome.result).toMatchObject({ candidateEntities: [], claims: [], questions: [], sources: [] });
    expect(outcome.result.summary).toContain('Новых сведений');
  });

  it('enriches an existing relation with a new source instead of adding another line', () => {
    const investigationCase = createSeedCase();
    const focus = investigationCase.entities[1];
    const outcome = mergeResearchResultWithOutcome(investigationCase, focus, {
      summary: 'Найден независимый источник.',
      identityAssessment: '', candidateEntities: [], questions: [], warnings: [],
      claims: [{ id: 'duplicate-relation', subjectId: 'anna-lebedeva', objectId: 'sergey-volkov', predicate: 'возможно видела', status: 'probable', confidence: 0.65, explanation: 'Новый источник подтверждает наблюдение.', sourceIds: ['independent-source'], occurredAt: '' }],
      sources: [{ id: 'independent-source', title: 'Независимое свидетельство', url: 'https://news.example.org/report', publisher: 'Новости', publishedAt: '2026-08-29', accessedAt: '2026-09-01' }],
    });

    expect(outcome.addedRelationCount).toBe(0);
    expect(outcome.updatedRelationCount).toBe(1);
    expect(outcome.addedSourceCount).toBe(1);
    expect(outcome.investigationCase.relations).toHaveLength(investigationCase.relations.length);
    expect(outcome.investigationCase.relations.find((relation) => relation.id === 'relation-anna-sergey')?.sourceIds).toEqual(['source-user-interview', 'independent-source']);
  });

  it('persists a new research question so a later run can de-duplicate it', () => {
    const investigationCase = createSeedCase();
    const focus = investigationCase.entities[1];
    const first = mergeResearchResultWithOutcome(investigationCase, focus, {
      summary: 'Остался вопрос.', identityAssessment: '', candidateEntities: [], claims: [], sources: [], warnings: [],
      questions: [{ text: 'Кому принадлежал автомобиль?', why: 'Нужно установить владельца.', priority: 'high' }],
    });
    const second = mergeResearchResultWithOutcome(first.investigationCase, focus, {
      summary: 'Тот же вопрос.', identityAssessment: '', candidateEntities: [], claims: [], sources: [], warnings: [],
      questions: [{ text: 'Кому принадлежал автомобиль?', why: 'Нужно установить владельца.', priority: 'high' }],
    });

    expect(first.addedQuestionCount).toBe(1);
    expect(first.investigationCase.entities.find((entity) => entity.id === focus.id)?.facts).toContainEqual(expect.objectContaining({ kind: 'question', text: 'Кому принадлежал автомобиль?', createdBy: 'ai' }));
    expect(second.addedQuestionCount).toBe(0);
    expect(second.hasNewInformation).toBe(false);
  });
});

describe('entity removal', () => {
  it('removes the card and every incoming or outgoing relation', () => {
    const investigationCase = createSeedCase();
    const entityId = investigationCase.entities[0].id;
    const unrelatedRelation = investigationCase.relations.find((relation) => relation.sourceId !== entityId && relation.targetId !== entityId);

    const result = removeEntityFromCase(investigationCase, entityId);

    expect(result.entities.some((entity) => entity.id === entityId)).toBe(false);
    expect(result.relations.some((relation) => relation.sourceId === entityId || relation.targetId === entityId)).toBe(false);
    if (unrelatedRelation) expect(result.relations).toContainEqual(unrelatedRelation);
  });
});

describe('board entity visibility', () => {
  it('follows active layers and case-insensitive search', () => {
    const entity = createSeedCase().entities[0];

    expect(isEntityVisible(entity, new Set([entity.type]), 'МОРОЗОВ')).toBe(true);
    expect(isEntityVisible(entity, new Set(), '')).toBe(false);
    expect(isEntityVisible(entity, new Set([entity.type]), 'другое имя')).toBe(false);
  });
});
