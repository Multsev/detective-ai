import { describe, expect, it } from 'vitest';
import type { CaseSummary } from '../src/shared/domain';
import { selectInitialCaseId } from '../src/client/lib/activeCase';

const cases: CaseSummary[] = [
  { id: 'case-0001-first', caseNumber: 1, subject: 'Первое', title: 'Дело № 0001', updatedAt: '', entityCount: 1, relationCount: 0 },
  { id: 'case-0002-second', caseNumber: 2, subject: 'Второе', title: 'Дело № 0002', updatedAt: '', entityCount: 1, relationCount: 0 },
];

describe('active case restoration', () => {
  it('restores the remembered case when it still exists', () => {
    expect(selectInitialCaseId(cases, 'case-0002-second')).toBe('case-0002-second');
  });

  it('falls back to the first available case for stale state', () => {
    expect(selectInitialCaseId(cases, 'case-9999-missing')).toBe('case-0001-first');
  });
});
