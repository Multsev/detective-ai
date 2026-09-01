import type { CodexStatus, EntityResearchState } from '../../shared/domain';

export type CodexIndicatorTone = 'checking' | 'ready' | 'warning' | 'unavailable' | 'running' | 'error';

export interface CodexIndicatorState {
  tone: CodexIndicatorTone;
  label: string;
}

export function getCodexIndicatorState(codex: CodexStatus, research: Record<string, EntityResearchState>): CodexIndicatorState {
  const tasks = Object.values(research)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.startedAt === item.startedAt) === index)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const running = tasks.filter((task) => task.status === 'running').length;

  if (running > 0) return { tone: 'running', label: `Codex выполняет исследований: ${running}` };
  if (tasks[0]?.status === 'error') return { tone: 'error', label: `Ошибка исследования: ${tasks[0].message}` };
  if (!codex.checkedAt) return { tone: 'checking', label: 'Проверяем Codex CLI' };
  if (codex.ready) return { tone: 'ready', label: 'Codex подключён и готов' };
  if (codex.installed) return { tone: 'warning', label: 'Codex установлен, требуется авторизация' };
  return { tone: 'unavailable', label: 'Codex CLI не найден' };
}
