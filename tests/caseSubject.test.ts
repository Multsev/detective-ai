import { describe, expect, it } from 'vitest';
import { getDefaultSubjectEntityId, getResearchSubjectEntityId, normalizeCaseSubject, resetResearchSubject, setResearchSubject } from '../src/shared/caseSubject.js';
import { removeEntityFromCase } from '../src/client/lib/graph.js';
import { createSeedCase } from '../src/shared/seed.js';

describe('case research subject', () => {
  it('infers the original subject for old case files', () => {
    const oldCase = { ...createSeedCase(), defaultSubjectEntityId: undefined, researchSubjectEntityId: undefined };
    const normalized = normalizeCaseSubject(oldCase);

    expect(getDefaultSubjectEntityId(normalized)).toBe('ivan-morozov');
    expect(getResearchSubjectEntityId(normalized)).toBe('ivan-morozov');
  });

  it('switches the research subject independently and restores the original', () => {
    const original = createSeedCase();
    const switched = setResearchSubject(original, 'anna-lebedeva');

    expect(switched.defaultSubjectEntityId).toBe('ivan-morozov');
    expect(switched.researchSubjectEntityId).toBe('anna-lebedeva');
    expect(resetResearchSubject(switched).researchSubjectEntityId).toBe('ivan-morozov');
  });

  it('falls back safely if the active subject card is deleted', () => {
    const switched = setResearchSubject(createSeedCase(), 'anna-lebedeva');
    const withoutActiveSubject = removeEntityFromCase(switched, 'anna-lebedeva');

    expect(withoutActiveSubject.defaultSubjectEntityId).toBe('ivan-morozov');
    expect(withoutActiveSubject.researchSubjectEntityId).toBe('ivan-morozov');
  });
});
