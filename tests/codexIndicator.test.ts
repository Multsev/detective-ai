import { describe, expect, it } from 'vitest';
import type { CodexStatus, EntityResearchState } from '../src/shared/domain';
import { getCodexIndicatorState } from '../src/client/lib/codexIndicator';

const readyCodex: CodexStatus = {
  installed: true,
  authenticated: true,
  ready: true,
  path: '/usr/local/bin/codex',
  version: '1.0.0',
  authMessage: 'authenticated',
  checkedAt: '2026-09-01T00:00:00.000Z',
};

function research(status: EntityResearchState['status'], message = 'Состояние исследования'): Record<string, EntityResearchState> {
  return {
    entity: {
      entityId: 'entity',
      entityIds: ['entity'],
      mode: 'information',
      source: 'web',
      status,
      message,
      startedAt: '2026-09-01T12:00:00.000Z',
    },
  };
}

describe('Codex indicator state', () => {
  it('shows a green ready state for a connected idle CLI', () => {
    expect(getCodexIndicatorState(readyCodex, {})).toEqual({ tone: 'ready', label: 'Codex подключён и готов' });
  });

  it('gives active and failed research priority over connection state', () => {
    expect(getCodexIndicatorState(readyCodex, research('running')).tone).toBe('running');
    expect(getCodexIndicatorState(readyCodex, research('error', 'Сеть недоступна'))).toEqual({ tone: 'error', label: 'Ошибка исследования: Сеть недоступна' });
  });

  it('distinguishes authorization, absence and initial checking', () => {
    expect(getCodexIndicatorState({ ...readyCodex, authenticated: false, ready: false }, {}).tone).toBe('warning');
    expect(getCodexIndicatorState({ ...readyCodex, installed: false, authenticated: false, ready: false }, {}).tone).toBe('unavailable');
    expect(getCodexIndicatorState({ ...readyCodex, checkedAt: '' }, {}).tone).toBe('checking');
  });
});
