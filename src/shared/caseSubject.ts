import type { InvestigationCase, InvestigationEntity } from './domain.js';

export function getDefaultSubjectEntityId(investigationCase: InvestigationCase): string | undefined {
  if (hasEntity(investigationCase, investigationCase.defaultSubjectEntityId)) return investigationCase.defaultSubjectEntityId;
  return inferDefaultSubject(investigationCase)?.id;
}

export function getResearchSubjectEntityId(investigationCase: InvestigationCase): string | undefined {
  if (hasEntity(investigationCase, investigationCase.researchSubjectEntityId)) return investigationCase.researchSubjectEntityId;
  return getDefaultSubjectEntityId(investigationCase);
}

export function getResearchSubjectEntity(investigationCase: InvestigationCase): InvestigationEntity | undefined {
  const subjectId = getResearchSubjectEntityId(investigationCase);
  return investigationCase.entities.find((entity) => entity.id === subjectId);
}

export function normalizeCaseSubject(investigationCase: InvestigationCase): InvestigationCase {
  const defaultSubjectEntityId = getDefaultSubjectEntityId(investigationCase);
  const researchSubjectEntityId = getResearchSubjectEntityId(investigationCase);
  return { ...investigationCase, defaultSubjectEntityId, researchSubjectEntityId };
}

export function setResearchSubject(investigationCase: InvestigationCase, entityId: string): InvestigationCase {
  if (!hasEntity(investigationCase, entityId)) return investigationCase;
  return { ...normalizeCaseSubject(investigationCase), researchSubjectEntityId: entityId };
}

export function resetResearchSubject(investigationCase: InvestigationCase): InvestigationCase {
  const normalized = normalizeCaseSubject(investigationCase);
  return { ...normalized, researchSubjectEntityId: normalized.defaultSubjectEntityId };
}

function hasEntity(investigationCase: InvestigationCase, entityId?: string): entityId is string {
  return Boolean(entityId && investigationCase.entities.some((entity) => entity.id === entityId));
}

function inferDefaultSubject(investigationCase: InvestigationCase): InvestigationEntity | undefined {
  return investigationCase.entities.find((entity) => entity.title.trim().toLocaleLowerCase('ru') === investigationCase.subject.trim().toLocaleLowerCase('ru'))
    ?? investigationCase.entities.find((entity) => entity.type === 'person' || entity.type === 'company')
    ?? investigationCase.entities[0];
}
