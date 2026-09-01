import type { InvestigationCase, InvestigationEntity, SourceReference } from '../../shared/domain';

export interface SourcePresentation {
  id: string;
  label: string;
  title: string;
  href?: string;
  kind: 'web' | 'file' | 'google';
  publishedAt?: string;
  dateLabel?: string;
}

export interface EntityProvenance {
  primary: SourcePresentation | { id: 'manual' | 'unknown'; label: string; title: string; kind: 'manual' | 'unknown' };
  additionalCount: number;
  sources: SourcePresentation[];
}

export function getEntityProvenance(investigationCase: InvestigationCase, entity: InvestigationEntity): EntityProvenance {
  return buildEntityProvenanceIndex(investigationCase).get(entity.id) ?? missingProvenance(entity, false);
}

export function buildEntityProvenanceIndex(investigationCase: InvestigationCase): Map<string, EntityProvenance> {
  const sourceById = new Map(investigationCase.sources.map((source) => [source.id, source]));
  const relationSourceIds = new Map<string, string[]>();
  const entitiesWithAiRelations = new Set<string>();

  for (const relation of investigationCase.relations) {
    for (const entityId of [relation.sourceId, relation.targetId]) {
      const ids = relationSourceIds.get(entityId) ?? [];
      ids.push(...relation.sourceIds);
      relationSourceIds.set(entityId, ids);
      if (relation.createdBy === 'ai') entitiesWithAiRelations.add(entityId);
    }
  }

  return new Map(investigationCase.entities.map((entity) => {
    const directSourceIds = new Set([
      ...(entity.sourceIds ?? []),
      ...entity.facts.flatMap((fact) => fact.sourceIds),
    ]);
    const orderedSourceIds = [
      ...directSourceIds,
      ...(relationSourceIds.get(entity.id) ?? []).filter((id) => !directSourceIds.has(id)),
    ];
    const seenSourceIds = new Set<string>();
    const sources: SourcePresentation[] = [];
    for (const sourceId of orderedSourceIds) {
      if (seenSourceIds.has(sourceId)) continue;
      seenSourceIds.add(sourceId);
      const source = sourceById.get(sourceId);
      if (source) sources.push(presentSource(source));
    }

    const provenance = sources.length > 0
      ? { primary: sources[0], additionalCount: sources.length - 1, sources }
      : missingProvenance(entity, entitiesWithAiRelations.has(entity.id));
    return [entity.id, provenance];
  }));
}

function missingProvenance(entity: InvestigationEntity, hasAiRelation: boolean): EntityProvenance {
  const aiCreated = entity.createdBy === 'ai' || hasAiRelation;
  return {
    primary: aiCreated
      ? { id: 'unknown', label: 'Источник не указан', title: 'Для найденной карточки не сохранён проверяемый источник.', kind: 'unknown' }
      : { id: 'manual', label: 'Вручную', title: 'Карточка или факт добавлены пользователем.', kind: 'manual' },
    additionalCount: 0,
    sources: [],
  };
}

export function presentSource(source: SourceReference): SourcePresentation {
  const dateLabel = formatTemporalDate(source.publishedAt);
  if (source.kind === 'uploaded_file') return { id: source.id, label: `Файл: ${source.title}`, title: source.title, kind: 'file', publishedAt: source.publishedAt || undefined, dateLabel };
  if (source.kind === 'google_contact') return { id: source.id, label: 'Google Контакты', title: source.title, kind: 'google', publishedAt: source.publishedAt || undefined, dateLabel };
  const href = safeWebUrl(source.url);
  return {
    id: source.id,
    label: href ? displayHost(href) : source.publisher || source.title,
    title: `${source.title}${source.publisher ? ` · ${source.publisher}` : ''}${dateLabel ? ` · опубликовано ${dateLabel}` : ''}`,
    href,
    kind: 'web',
    publishedAt: source.publishedAt || undefined,
    dateLabel,
  };
}

export function formatTemporalDate(value?: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.includes('/')) {
    const [from, to] = normalized.split('/', 2);
    const formattedFrom = formatTemporalDate(from);
    const formattedTo = formatTemporalDate(to);
    return formattedFrom && formattedTo ? `${formattedFrom} — ${formattedTo}` : normalized;
  }
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(normalized);
  if (!match) return normalized;
  const [, year, month, day] = match;
  if (day) return `${day}.${month}.${year}`;
  if (month) return `${month}.${year}`;
  return year;
}

function safeWebUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function displayHost(value: string): string {
  return new URL(value).hostname.replace(/^www\./, '');
}
