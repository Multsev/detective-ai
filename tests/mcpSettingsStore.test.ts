import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { McpSettingsStore } from '../src/server/storage/mcpSettingsStore.js';

describe('MCP settings store', () => {
  it('creates safe disabled presets and reports runtime readiness', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'detective-mcp-settings-'));
    try {
      const store = new McpSettingsStore(directory);
      const view = await store.view();
      expect(view.servers.length).toBeGreaterThanOrEqual(4);
      expect(view.servers.every((server) => !server.enabled)).toBe(true);
      expect(view.servers.find((server) => server.id === 'brave_search')?.requiredEnvVars).toContain('BRAVE_API_KEY');
      const persisted = await readFile(path.join(directory, 'mcp-settings.json'), 'utf8');
      expect(persisted).not.toContain('YOUR_API_KEY');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
