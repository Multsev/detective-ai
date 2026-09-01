import type { InvestigationCase, SourceReference } from './domain.js';

export const webSourceRecheckDays = 30;

function addDays(iso: string, days: number): string {
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00.000Z` : iso);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function comparable(source: SourceReference): string {
  return JSON.stringify([source.title, source.url, source.publisher, source.publishedAt]);
}

export function normalizeSourceFreshness(source: SourceReference): SourceReference {
  if (source.kind && source.kind !== 'web') return source;
  const lastCheckedAt = source.lastCheckedAt || source.accessedAt;
  return {
    ...source,
    kind: source.kind ?? 'web',
    lastCheckedAt,
    nextCheckAt: source.nextCheckAt || addDays(lastCheckedAt, webSourceRecheckDays),
    checkCount: Math.max(1, source.checkCount ?? 1),
    lastChangedAt: source.lastChangedAt || source.publishedAt || lastCheckedAt,
  };
}

export function getSourceFreshness(source: SourceReference, now = new Date()): 'current' | 'due' | 'static' | 'unknown' {
  if (source.kind === 'uploaded_file' || source.kind === 'google_contact') return 'static';
  const normalized = normalizeSourceFreshness(source);
  const next = new Date(normalized.nextCheckAt || '');
  if (Number.isNaN(next.getTime())) return 'unknown';
  return next.getTime() <= now.getTime() ? 'due' : 'current';
}

export function getSourcesDueForRecheck(investigationCase: InvestigationCase, now = new Date()): SourceReference[] {
  return investigationCase.sources.filter((source) => getSourceFreshness(source, now) === 'due').sort((left, right) => (left.lastCheckedAt || left.accessedAt).localeCompare(right.lastCheckedAt || right.accessedAt));
}

export function refreshSourceReference(existing: SourceReference | undefined, incoming: SourceReference, checkedAt: string): SourceReference {
  const changed = existing ? comparable(existing) !== comparable(incoming) : true;
  const lastCheckedAt = checkedAt || incoming.accessedAt || new Date().toISOString();
  return normalizeSourceFreshness({
    ...(existing ?? {}),
    ...incoming,
    id: existing?.id ?? incoming.id,
    accessedAt: incoming.accessedAt || lastCheckedAt.slice(0, 10),
    lastCheckedAt,
    nextCheckAt: addDays(lastCheckedAt, webSourceRecheckDays),
    checkCount: (existing?.checkCount ?? 0) + 1,
    lastChangedAt: changed ? lastCheckedAt : existing?.lastChangedAt,
  });
}
