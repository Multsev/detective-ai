import type { InvestigationCase, InvestigationEntity, SourceReference } from '../../shared/domain';

export interface SourcePresentation {
  id: string;
  label: string;
  title: string;
  href?: string;
  kind: 'web' | 'file' | 'google';
}

export interface EntityProvenance {
  primary: SourcePresentation | { id: 'manual' | 'unknown'; label: string; title: string; kind: 'manual' | 'unknown' };
  additionalCount: number;
  sources: SourcePresentation[];
}

export function getEntityProvenance(investigationCase: InvestigationCase, entity: InvestigationEntity): EntityProvenance {
  const directSourceIds = new Set([
    ...(entity.sourceIds ?? []),
    ...entity.facts.flatMap((fact) => fact.sourceIds),
  ]);
  const relationSourceIds = investigationCase.relations
    .filter((relation) => relation.sourceId === entity.id || relation.targetId === entity.id)
    .flatMap((relation) => relation.sourceIds);
  const orderedSourceIds = [...directSourceIds, ...relationSourceIds.filter((id) => !directSourceIds.has(id))];
  const sourceById = new Map(investigationCase.sources.map((source) => [source.id, source]));
  const sources = orderedSourceIds
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is SourceReference => Boolean(source))
    .map(presentSource);

  if (sources.length > 0) return { primary: sources[0], additionalCount: sources.length - 1, sources };
  const hasAiRelation = investigationCase.relations.some((relation) =>
    (relation.sourceId === entity.id || relation.targetId === entity.id) && relation.createdBy === 'ai');
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
  if (source.kind === 'uploaded_file') return { id: source.id, label: `Файл: ${source.title}`, title: source.title, kind: 'file' };
  if (source.kind === 'google_contact') return { id: source.id, label: 'Google Контакты', title: source.title, kind: 'google' };
  const href = safeWebUrl(source.url);
  return {
    id: source.id,
    label: href ? displayHost(href) : source.publisher || source.title,
    title: `${source.title}${source.publisher ? ` · ${source.publisher}` : ''}`,
    href,
    kind: 'web',
  };
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
