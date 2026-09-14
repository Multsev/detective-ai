import { describe, expect, it } from 'vitest';
import { ResearchExecutionAudit, createRequiredSourceCoverage } from '../src/server/research/researchExecutionAudit.js';
import type { McpServerSetting } from '../src/shared/domain.js';

const fetchServer: McpServerSetting = {
  id: 'fetch', name: 'Fetch', description: '', enabled: true, transport: 'stdio', command: 'uvx', args: ['mcp-server-fetch'], url: '', bearerTokenEnvVar: '', envVars: [], requiredEnvVars: [], sourceUrl: '', caution: '', preset: true,
};

describe('research execution audit', () => {
  it('requires web search and every enabled MCP server', () => {
    const audit = new ResearchExecutionAudit(createRequiredSourceCoverage([fetchServer]));
    audit.observe(JSON.stringify({ type: 'item.started', item: { id: 'web-1', type: 'web_search', query: 'ООО Пример ИНН' } }));
    audit.observe(JSON.stringify({ type: 'item.completed', item: { id: 'web-1', type: 'web_search', query: 'ООО Пример ИНН', status: 'completed' } }));
    expect(() => audit.assertComplete()).toThrow('Fetch');

    audit.observe(JSON.stringify({ type: 'item.started', item: { id: 'mcp-1', type: 'mcp_tool_call', server: 'fetch', tool: 'fetch', arguments: { url: 'https://example.org' }, status: 'in_progress' } }));
    audit.observe(JSON.stringify({ type: 'item.completed', item: { id: 'mcp-1', type: 'mcp_tool_call', server: 'fetch', tool: 'fetch', arguments: { url: 'https://example.org' }, status: 'completed' } }));
    expect(() => audit.assertComplete()).not.toThrow();
    expect(audit.getCoverage()).toEqual(expect.arrayContaining([
      expect.objectContaining({ channelId: 'web_search', status: 'completed', attempts: 1 }),
      expect.objectContaining({ channelId: 'fetch', status: 'completed', attempts: 1 }),
    ]));
    expect(audit.getActivity()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'query', query: 'ООО Пример ИНН', status: 'completed' }),
      expect.objectContaining({ kind: 'mcp_call', channelId: 'fetch', url: 'https://example.org', status: 'completed' }),
    ]));
  });

  it('does not accept a failed mandatory source', () => {
    const audit = new ResearchExecutionAudit(createRequiredSourceCoverage([fetchServer]));
    audit.observe(JSON.stringify({ type: 'item.started', item: { id: 'web-1', type: 'web_search' } }));
    audit.observe(JSON.stringify({ type: 'item.completed', item: { id: 'web-1', type: 'web_search', status: 'completed' } }));
    audit.observe(JSON.stringify({ type: 'item.started', item: { id: 'mcp-1', type: 'mcp_tool_call', server: 'fetch', tool: 'fetch' } }));
    audit.observe(JSON.stringify({ type: 'item.completed', item: { id: 'mcp-1', type: 'mcp_tool_call', server: 'fetch', tool: 'fetch', status: 'failed', error: { message: 'network error' } } }));
    expect(() => audit.assertComplete()).toThrow('network error');
  });
});
