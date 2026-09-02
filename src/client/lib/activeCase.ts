import type { CaseSummary } from '../../shared/domain';

export const activeCaseStorageKey = 'detective:active-case-id';

export function selectInitialCaseId(cases: readonly CaseSummary[], rememberedCaseId: string): string | undefined {
  return cases.find((item) => item.id === rememberedCaseId)?.id ?? cases[0]?.id;
}
