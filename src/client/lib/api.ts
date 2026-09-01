import type { CaseSummary, CreateCaseInput, GoogleContact, GoogleIntegrationStatus, HealthStatus, InvestigationCase, McpSettings, McpSettingsView, ResearchStreamEvent } from '../../shared/domain';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'Ошибка запроса.');
  return payload as T;
}

async function consumeResearchStream(response: Response, onEvent: (event: ResearchStreamEvent) => void): Promise<void> {
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
}

export const api = {
  health: () => request<HealthStatus>('/api/health'),
  refreshCodexStatus: () => request<HealthStatus>('/api/codex/status'),
  loadMcpSettings: () => request<McpSettingsView>('/api/mcp/settings'),
  saveMcpSettings: (settings: McpSettings) => request<McpSettingsView>('/api/mcp/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  googleStatus: () => request<GoogleIntegrationStatus>('/api/google/status'),
  listGoogleContacts: (signal?: AbortSignal) => request<GoogleContact[]>('/api/google/contacts', { signal }),
  disconnectGoogle: () => request<GoogleIntegrationStatus>('/api/google/connection', { method: 'DELETE' }),
  listCases: () => request<CaseSummary[]>('/api/cases'),
  loadCase: (caseId: string) => request<InvestigationCase>(`/api/cases/${caseId}`),
  createCase: (input: CreateCaseInput) => request<InvestigationCase>('/api/cases', { method: 'POST', body: JSON.stringify(input) }),
  saveCase: (investigationCase: InvestigationCase) => request<InvestigationCase>(`/api/cases/${investigationCase.id}`, {
    method: 'PUT',
    body: JSON.stringify(investigationCase),
  }),
  async researchInformationStream(caseId: string, entityId: string, question: string, onEvent: (event: ResearchStreamEvent) => void) {
    const response = await fetch('/api/research/information/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, entityId, question }),
    });
    await consumeResearchStream(response, onEvent);
  },
  async researchFileStream(caseId: string, entityId: string, question: string, file: File, onEvent: (event: ResearchStreamEvent) => void) {
    const body = new FormData();
    body.set('caseId', caseId);
    body.set('entityId', entityId);
    body.set('question', question);
    body.set('file', file);
    await consumeResearchStream(await fetch('/api/research/file/stream', { method: 'POST', body }), onEvent);
  },
  async researchRelationshipsStream(caseId: string, entityIds: string[], question: string, onEvent: (event: ResearchStreamEvent) => void) {
    const response = await fetch('/api/research/relationships/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, entityIds, question }),
    });
    await consumeResearchStream(response, onEvent);
  },
};
