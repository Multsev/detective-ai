import type { InvestigationCase, InvestigationEntity, QuestionDetails, QuestionPriority } from './domain.js';

function priorityFromSubtitle(subtitle: string): QuestionPriority {
  const normalized = subtitle.toLocaleLowerCase('ru-RU');
  if (normalized.includes('высок')) return 'high';
  if (normalized.includes('низк')) return 'low';
  return 'medium';
}

function uniqueExistingIds(ids: readonly string[], investigationCase: InvestigationCase, questionId: string): string[] {
  const existing = new Set(investigationCase.entities.map((entity) => entity.id));
  return [...new Set(ids)].filter((id) => id !== questionId && existing.has(id));
}

export function getQuestionDetails(entity: InvestigationEntity, investigationCase?: InvestigationCase): QuestionDetails | undefined {
  if (entity.type !== 'question') return undefined;
  const relatedIds = investigationCase
    ? investigationCase.relations.flatMap((relation) => {
      if (relation.sourceId === entity.id) return [relation.targetId];
      if (relation.targetId === entity.id) return [relation.sourceId];
      return [];
    })
    : [];
  const current = entity.question;
  const createdAt = current?.createdAt || investigationCase?.updatedAt || new Date(0).toISOString();
  return {
    status: current?.status ?? 'open',
    priority: current?.priority ?? priorityFromSubtitle(entity.subtitle),
    why: current?.why ?? entity.summary,
    successCriteria: current?.successCriteria || 'Найти проверяемый ответ и подтвердить его источником.',
    aboutEntityIds: investigationCase ? uniqueExistingIds(current?.aboutEntityIds?.length ? current.aboutEntityIds : relatedIds, investigationCase, entity.id) : (current?.aboutEntityIds ?? relatedIds),
    originResearchRunId: current?.originResearchRunId,
    answer: current?.answer,
    answerSourceIds: [...new Set(current?.answerSourceIds ?? [])],
    researchRunIds: [...new Set(current?.researchRunIds ?? [])],
    resolvedByEntityIds: [...new Set(current?.resolvedByEntityIds ?? [])],
    resolvedByRelationIds: [...new Set(current?.resolvedByRelationIds ?? [])],
    createdAt,
    resolvedAt: current?.resolvedAt,
  };
}

export function normalizeCaseQuestions(investigationCase: InvestigationCase): InvestigationCase {
  return {
    ...investigationCase,
    entities: investigationCase.entities.map((entity) => entity.type === 'question'
      ? { ...entity, question: getQuestionDetails(entity, investigationCase) }
      : entity),
  };
}

export function isResolvedQuestion(entity: InvestigationEntity): boolean {
  return entity.type === 'question' && ['answered', 'dismissed'].includes(entity.question?.status ?? 'open');
}
