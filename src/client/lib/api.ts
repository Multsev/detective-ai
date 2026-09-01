import type { HealthStatus, InvestigationCase, ResearchStreamEvent } from '../../shared/domain';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'Ошибка запроса.');
  return payload as T;
}

export const api = {
  health: () => request<HealthStatus>('/api/health'),
  refreshCodexStatus: () => request<HealthStatus>('/api/codex/status'),
  loadCase: () => request<InvestigationCase>('/api/case'),
  saveCase: (investigationCase: InvestigationCase) => request<InvestigationCase>('/api/case', {
    method: 'PUT',
    body: JSON.stringify(investigationCase),
  }),
  async researchStream(entityId: string, question: string, onEvent: (event: ResearchStreamEvent) => void) {
    const response = await fetch('/api/research/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId, question }),
    });
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error ?? 'Не удалось запустить Codex.');
    }
    if (!response.body) throw new Error('Сервер не вернул поток исследования.');

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as ResearchStreamEvent;
        onEvent(event);
        if (event.type === 'error') throw new Error(event.message);
      }
    }
  },
};
