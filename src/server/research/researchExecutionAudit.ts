import { randomUUID } from 'node:crypto';
import type { McpServerSetting, ResearchActivity, ResearchSourceCoverage, ResearchStreamEvent, SourceReference } from '../../shared/domain.js';

interface CodexCliItem {
  id?: string;
  type?: string;
  query?: string;
  server?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  status?: string;
  error?: { message?: string } | string | null;
}

interface CodexCliEvent {
  type?: string;
  item?: CodexCliItem;
}

function errorMessage(item: CodexCliItem): string | undefined {
  if (typeof item.error === 'string') return item.error;
  return item.error?.message;
}

function activityStatus(item: CodexCliItem): ResearchActivity['status'] {
  return item.status === 'failed' || Boolean(item.error) ? 'failed' : 'completed';
}

function activityUrl(item: CodexCliItem): string | undefined {
  const value = item.arguments?.url;
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : undefined;
}

export function createRequiredSourceCoverage(servers: McpServerSetting[], documentTitle?: string): ResearchSourceCoverage[] {
  if (documentTitle) {
    return [{ channelId: 'file', channelName: documentTitle, kind: 'file', required: true, status: 'pending', attempts: 0, message: 'Материал ожидает анализа.' }];
  }
  return [
    { channelId: 'web_search', channelName: 'Web Search', kind: 'web_search', required: true, status: 'pending', attempts: 0, message: 'Ожидает поискового запроса.' },
    ...servers.filter((server) => server.enabled).map((server) => ({
      channelId: server.id,
      channelName: server.name,
      kind: 'mcp' as const,
      required: true,
      status: 'pending' as const,
      attempts: 0,
      message: 'Ожидает обязательного обращения.',
    })),
  ];
}

export class ResearchExecutionAudit {
  private readonly coverageById: Map<string, ResearchSourceCoverage>;
  private readonly activityById = new Map<string, ResearchActivity>();
  private readonly executionId = randomUUID();

  constructor(coverage: ResearchSourceCoverage[]) {
    this.coverageById = new Map(coverage.map((item) => [item.channelId, { ...item }]));
  }

  observe(rawLine: string): ResearchStreamEvent[] {
    let event: CodexCliEvent;
    try {
      event = JSON.parse(rawLine) as CodexCliEvent;
    } catch {
      return [];
    }

    const item = event.item;
    const emitted: ResearchStreamEvent[] = [];
    if (event.type === 'thread.started') emitted.push({ type: 'status', stage: 'starting', message: 'Codex создал исследовательскую сессию.' });
    if (event.type === 'turn.started') emitted.push({ type: 'status', stage: 'planning', message: 'Анализирую карточки и обязательный план источников.' });
    if (event.type === 'turn.completed') emitted.push({ type: 'status', stage: 'structuring', message: 'Поиск завершён, проверяю покрытие источников и строю граф.' });
    if (event.type === 'turn.failed' || event.type === 'error') emitted.push({ type: 'status', stage: 'warning', message: 'Codex сообщил о проблеме во время исследования.' });
    if (!item?.id) return emitted;

    if (item.type === 'web_search') {
      const coverage = this.coverageById.get('web_search');
      if (event.type === 'item.started') {
        if (coverage) this.coverageById.set('web_search', { ...coverage, attempts: coverage.attempts + 1, message: item.query ? `Запрос: ${item.query}` : 'Выполняется веб-поиск.' });
        const activityId = this.activityId(item.id);
        const activity: ResearchActivity = {
          id: activityId,
          kind: 'query',
          channelId: 'web_search',
          channelName: 'Web Search',
          status: 'running',
          startedAt: new Date().toISOString(),
          query: item.query,
        };
        this.activityById.set(activityId, activity);
        emitted.push({ type: 'status', stage: 'searching', message: item.query ? `Ищу: ${item.query}` : 'Выполняю поиск в открытых источниках.' }, { type: 'activity', activity });
      }
      if (event.type === 'item.completed') {
        emitted.push({ type: 'status', stage: 'sources', message: 'Поисковый канал проверен, сопоставляю утверждения.' }, { type: 'activity', activity: this.completeActivity(item, 'web_search', 'Web Search', 'query') });
        const completedCoverage = this.coverageById.get('web_search');
        if (completedCoverage) emitted.push({ type: 'coverage', coverage: completedCoverage });
      }
    }

    if (item.type === 'mcp_tool_call') {
      const channelId = item.server ?? 'unknown_mcp';
      const coverage = this.coverageById.get(channelId);
      const channelName = coverage?.channelName ?? item.server ?? 'MCP';
      if (event.type === 'item.started') {
        if (coverage) this.coverageById.set(channelId, { ...coverage, attempts: coverage.attempts + 1, message: `Вызов ${item.tool ?? 'инструмента'}.` });
        const activityId = this.activityId(item.id);
        const activity: ResearchActivity = {
          id: activityId,
          kind: 'mcp_call',
          channelId,
          channelName,
          status: 'running',
          startedAt: new Date().toISOString(),
          tool: item.tool,
          url: activityUrl(item),
        };
        this.activityById.set(activityId, activity);
        emitted.push({ type: 'status', stage: 'sources', message: `Запрашиваю источник «${channelName}».` }, { type: 'activity', activity });
      }
      if (event.type === 'item.completed') {
        emitted.push({ type: 'activity', activity: this.completeActivity(item, channelId, channelName, 'mcp_call') });
        const completedCoverage = this.coverageById.get(channelId);
        if (completedCoverage) emitted.push({ type: 'coverage', coverage: completedCoverage });
      }
    }
    return emitted;
  }

  completeFile(documentTitle: string): void {
    const finishedAt = new Date().toISOString();
    const coverage = this.coverageById.get('file');
    if (coverage) this.coverageById.set('file', { ...coverage, status: 'completed', attempts: 1, message: 'Материал полностью передан агенту и обработан.' });
    const activityId = this.activityId(`file:${documentTitle}`);
    this.activityById.set(activityId, {
      id: activityId,
      kind: 'source',
      channelId: 'file',
      channelName: documentTitle,
      status: 'completed',
      startedAt: finishedAt,
      finishedAt,
      message: 'Текст материала обработан без обращения к интернету.',
    });
  }

  recordSources(sources: SourceReference[]): void {
    const now = new Date().toISOString();
    for (const source of sources.filter((item) => /^https?:\/\//i.test(item.url))) {
      const id = this.activityId(`source:${source.id}`);
      if (this.activityById.has(id)) continue;
      this.activityById.set(id, { id, kind: 'source', channelId: 'evidence', channelName: source.publisher || 'Веб-источник', status: 'completed', startedAt: now, finishedAt: now, url: source.url, message: source.title });
    }
  }

  getCoverage(): ResearchSourceCoverage[] {
    return [...this.coverageById.values()];
  }

  getActivity(): ResearchActivity[] {
    return [...this.activityById.values()];
  }

  assertComplete(): void {
    const incomplete = this.getCoverage().filter((item) => item.required && item.status !== 'completed');
    if (!incomplete.length) return;
    throw new Error(`Исследование не завершено: обязательные источники не опрошены успешно — ${incomplete.map((item) => `${item.channelName} (${item.message})`).join('; ')}.`);
  }

  private completeActivity(item: CodexCliItem, channelId: string, channelName: string, kind: ResearchActivity['kind']): ResearchActivity {
    const itemId = this.activityId(item.id ?? `${channelId}:${kind}:${this.activityById.size}`);
    const previous = this.activityById.get(itemId);
    const status = activityStatus(item);
    const finishedAt = new Date().toISOString();
    const activity: ResearchActivity = {
      id: itemId,
      kind,
      channelId,
      channelName,
      status,
      startedAt: previous?.startedAt ?? finishedAt,
      finishedAt,
      query: item.query ?? previous?.query,
      url: activityUrl(item) ?? previous?.url,
      tool: item.tool ?? previous?.tool,
      message: errorMessage(item),
    };
    this.activityById.set(itemId, activity);
    const coverage = this.coverageById.get(channelId);
    if (coverage) {
      const completed = status === 'completed' || coverage.status === 'completed';
      this.coverageById.set(channelId, {
        ...coverage,
        status: completed ? 'completed' : 'failed',
        message: completed ? 'Источник успешно опрошен.' : (activity.message || 'Источник завершил вызов с ошибкой.'),
      });
    }
    return activity;
  }

  private activityId(itemId: string): string {
    return `${this.executionId}:${itemId}`;
  }
}
