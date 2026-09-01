import type { HealthStatus, InvestigationCase, ResearchResult } from '../../shared/domain';

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
  loadCase: () => request<InvestigationCase>('/api/case'),
  saveCase: (investigationCase: InvestigationCase) => request<InvestigationCase>('/api/case', {
    method: 'PUT',
    body: JSON.stringify(investigationCase),
  }),
  research: (entityId: string, question: string) => request<ResearchResult>('/api/research', {
    method: 'POST',
    body: JSON.stringify({ entityId, question }),
  }),
};
