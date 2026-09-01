import { describe, expect, it } from 'vitest';
import { answerQuestionManually, mergeQuestionResolutionResult, mergeResearchResultWithOutcome } from '../src/client/lib/graph.js';
import { getQuestionDetails, normalizeCaseQuestions } from '../src/shared/questions.js';
import { createSeedCase } from '../src/shared/seed.js';

describe('question lifecycle', () => {
  it('migrates a legacy question card without losing its graph scope', () => {
    const seed = createSeedCase();
    const focus = seed.entities[0];
    const legacy = { id: 'legacy-question', type: 'question' as const, title: 'Кто подписал документ?', subtitle: 'Высокий приоритет', summary: 'Нужно установить подписанта.', position: { x: 0, y: 0 }, facts: [] };
    const investigationCase = normalizeCaseQuestions({
      ...seed,
      entities: [...seed.entities, legacy],
      relations: [...seed.relations, { id: 'legacy-question-link', sourceId: focus.id, targetId: legacy.id, label: 'требует проверки', explanation: '', status: 'unknown' as const, confidence: 0, sourceIds: [] }],
    });

    expect(getQuestionDetails(investigationCase.entities.at(-1)!, investigationCase)).toMatchObject({
      status: 'open', priority: 'high', aboutEntityIds: [focus.id], why: 'Нужно установить подписанта.',
    });
  });

  it('de-duplicates a repeated question while retaining its scope and criterion', () => {
    const seed = createSeedCase();
    const focus = seed.entities[0];
    const result = {
      summary: 'Нужна дополнительная проверка.', identityAssessment: '', candidateEntities: [], entityUpdates: [], claims: [], sources: [], warnings: [], questionResolution: null,
      questions: [{ text: 'Кто подписал документ?', why: 'Установить подписанта.', priority: 'high' as const, aboutEntityIds: [focus.id], successCriteria: 'Найти подпись в официальном документе.' }],
    };
    const first = mergeResearchResultWithOutcome(seed, focus, result);
    const second = mergeResearchResultWithOutcome(first.investigationCase, focus, result);
    const question = first.investigationCase.entities.find((entity) => entity.type === 'question' && entity.title === 'Кто подписал документ?');

    expect(question?.question).toMatchObject({ aboutEntityIds: [focus.id], successCriteria: 'Найти подпись в официальном документе.' });
    expect(first.addedQuestionCount).toBe(1);
    expect(second.addedQuestionCount).toBe(0);
  });

  it('safely resolves a sourced answer and records repeated runs without duplicate relations', () => {
    const seed = createSeedCase();
    const focus = seed.entities[0];
    const target = seed.entities[1];
    const question = {
      id: 'question-owner', type: 'question' as const, title: 'Кто связан с объектом?', subtitle: 'Высокий приоритет', summary: 'Проверить связь.', position: { x: 0, y: 0 }, facts: [],
      question: { status: 'open' as const, priority: 'high' as const, why: 'Проверить связь.', successCriteria: 'Подтвердить первичным источником.', aboutEntityIds: [focus.id], answerSourceIds: [], researchRunIds: [], resolvedByEntityIds: [], resolvedByRelationIds: [], createdAt: '2026-09-01T00:00:00.000Z' },
    };
    const investigationCase = { ...seed, entities: [...seed.entities, question] };
    const result = {
      summary: 'Связь подтверждена.', identityAssessment: '', candidateEntities: [], entityUpdates: [], questions: [], warnings: [],
      claims: [{ id: 'answer-relation', subjectId: focus.id, objectId: target.id, predicate: 'связан с', status: 'official' as const, confidence: 0.95, explanation: 'Подтверждено документом.', sourceIds: ['official-answer'], occurredAt: '2025' }],
      sources: [{ id: 'official-answer', title: 'Официальный документ', url: 'https://example.org/official', publisher: 'Example', publishedAt: '2025', accessedAt: '2026-09-01' }],
      questionResolution: { questionId: question.id, outcome: 'answered' as const, answer: 'Связь подтверждена.', confidence: 0.95, sourceIds: ['official-answer'], resolvedClaimIds: ['answer-relation'] },
    };
    const first = mergeQuestionResolutionResult(investigationCase, question, result, 'run-1');
    const currentQuestion = first.investigationCase.entities.find((entity) => entity.id === question.id)!;
    const second = mergeQuestionResolutionResult(first.investigationCase, currentQuestion, result, 'run-2');

    expect(first.question).toMatchObject({ status: 'answered', researchRunIds: ['run-1'], resolvedByRelationIds: ['answer-relation'] });
    expect(second.question.researchRunIds).toEqual(['run-1', 'run-2']);
    expect(second.investigationCase.relations.filter((relation) => relation.id === 'answer-relation')).toHaveLength(1);
  });

  it('stores a manual answer as user asserted and de-duplicates the relation', () => {
    const seed = createSeedCase();
    const source = seed.entities[0]; const target = seed.entities[1];
    const question = { id: 'manual-question', type: 'question' as const, title: 'Как они связаны?', subtitle: '', summary: '', position: { x: 0, y: 0 }, facts: [], question: { status: 'open' as const, priority: 'medium' as const, why: '', successCriteria: '', aboutEntityIds: [source.id], answerSourceIds: [], researchRunIds: [], resolvedByEntityIds: [], resolvedByRelationIds: [], createdAt: '' } };
    const investigationCase = { ...seed, entities: [...seed.entities, question] };
    const first = answerQuestionManually(investigationCase, question.id, 'Работали вместе.', source.id, target.id, 'работал с');
    const second = answerQuestionManually(first, question.id, 'Работали вместе.', source.id, target.id, 'работал с');

    expect(first.relations.at(-1)).toMatchObject({ status: 'user_asserted', createdBy: 'user' });
    expect(second.relations).toHaveLength(first.relations.length);
    expect(second.entities.find((entity) => entity.id === question.id)?.question).toMatchObject({ status: 'answered', answer: 'Работали вместе.' });
  });
});
