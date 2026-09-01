import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { McpSettingsStore } from '../src/server/storage/mcpSettingsStore.js';

describe('MCP settings store', () => {
  it('creates safe disabled presets and reports runtime readiness', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'detective-mcp-settings-'));
    try {
      const store = new McpSettingsStore(directory);
      const view = await store.view();
      expect(view.servers).toHaveLength(3);
      expect(view.servers.every((server) => !server.enabled)).toBe(true);
      expect(view.servers.find((server) => server.id === 'brave_search')?.requiredEnvVars).toContain('BRAVE_API_KEY');
      const persisted = await readFile(path.join(directory, 'mcp-settings.json'), 'utf8');
      expect(persisted).not.toContain('YOUR_API_KEY');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('removes the retired custom OSINT server from existing settings', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'detective-mcp-settings-'));
    try {
      const store = new McpSettingsStore(directory);
      const current = await store.load();
      await writeFile(path.join(directory, 'mcp-settings.json'), JSON.stringify({ ...current, servers: [...current.servers, { ...current.servers[0], id: 'custom_osint', name: 'Пользовательский OSINT MCP' }] }));
      const migrated = await store.load();
      expect(migrated.servers.some((server) => server.id === 'custom_osint')).toBe(false);
      expect(await readFile(path.join(directory, 'mcp-settings.json'), 'utf8')).not.toContain('custom_osint');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
