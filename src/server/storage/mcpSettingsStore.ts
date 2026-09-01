import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { z } from 'zod';
import type { McpServerReadiness, McpServerSetting, McpSettings, McpSettingsView } from '../../shared/domain.js';

const serverSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{1,47}$/),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(400),
  enabled: z.boolean(),
  transport: z.enum(['stdio', 'http']),
  command: z.string().max(500),
  args: z.array(z.string().max(500)).max(30),
  url: z.string().max(1000),
  bearerTokenEnvVar: z.union([z.literal(''), z.string().regex(/^[A-Z_][A-Z0-9_]*$/)]).default(''),
  envVars: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).max(20),
  requiredEnvVars: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).max(20),
  sourceUrl: z.string().max(1000),
  caution: z.string().max(500),
  preset: z.boolean(),
}).superRefine((server, context) => {
  if (server.enabled && server.transport === 'stdio' && !server.command.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['command'], message: 'Для stdio MCP нужна команда запуска.' });
  }
  if (server.enabled && server.transport === 'http' && !/^https?:\/\//.test(server.url)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Для HTTP MCP нужен адрес http:// или https://.' });
  }
  for (const variable of server.requiredEnvVars) {
    if (!server.envVars.includes(variable)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['envVars'], message: `${variable} должен быть указан в envVars.` });
  }
});

const settingsSchema = z.object({
  servers: z.array(serverSchema).max(20).refine((servers) => new Set(servers.map((server) => server.id)).size === servers.length, 'Идентификаторы MCP должны быть уникальны.'),
  updatedAt: z.string(),
});

export const defaultMcpServers: McpServerSetting[] = [
  {
    id: 'fetch', name: 'Fetch', enabled: false, transport: 'stdio', command: 'uvx', args: ['mcp-server-fetch'], url: '', bearerTokenEnvVar: '', envVars: [], requiredEnvVars: [], preset: true,
    description: 'Читает публичные веб-страницы и преобразует HTML в удобный для анализа текст.',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    caution: 'Сервер способен обращаться к локальным адресам. Включайте только для доверенных задач и не отключайте robots.txt.',
  },
  {
    id: 'mediawiki', name: 'MediaWiki / Wikipedia', enabled: false, transport: 'stdio', command: 'npx', args: ['-y', '@professional-wiki/mediawiki-mcp-server@0.17.0'], url: '', bearerTokenEnvVar: '', envVars: [], requiredEnvVars: [], preset: true,
    description: 'Ищет и читает страницы, категории и историю правок публичных MediaWiki-проектов.',
    sourceUrl: 'https://github.com/ProfessionalWiki/MediaWiki-MCP-Server', caution: 'Энциклопедическая статья является отправной точкой, а не первичным доказательством.',
  },
  {
    id: 'brave_search', name: 'Brave Search', enabled: false, transport: 'stdio', command: 'npx', args: ['-y', '@brave/brave-search-mcp-server@2.1.3', '--transport', 'stdio'], url: '', bearerTokenEnvVar: '', envVars: ['BRAVE_API_KEY'], requiredEnvVars: ['BRAVE_API_KEY'], preset: true,
    description: 'Поиск по вебу, новостям, изображениям и публичным организациям через Brave Search API.',
    sourceUrl: 'https://github.com/brave/brave-search-mcp-server', caution: 'Нужен ключ Brave Search API в переменной окружения BRAVE_API_KEY; значение ключа приложение не хранит.',
  },
];

const removedServerIds = new Set(['custom_osint']);

async function commandExists(command: string): Promise<boolean> {
  if (!command) return false;
  if (path.isAbsolute(command)) {
    try { await access(command, constants.X_OK); return true; } catch { return false; }
  }
  const directories = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    try { await access(path.join(directory, command), constants.X_OK); return true; } catch { /* continue */ }
  }
  return false;
}

export class McpSettingsStore {
  private readonly filePath: string;

  constructor(dataDirectory = path.join(process.cwd(), 'data')) {
    this.filePath = path.join(dataDirectory, 'mcp-settings.json');
  }

  async load(): Promise<McpSettings> {
    try {
      const settings = settingsSchema.parse(JSON.parse(await readFile(this.filePath, 'utf8')));
      const servers = settings.servers.filter((server) => !removedServerIds.has(server.id));
      return servers.length === settings.servers.length ? settings : this.save({ ...settings, servers });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      return this.save({ servers: defaultMcpServers, updatedAt: new Date().toISOString() });
    }
  }

  async save(input: McpSettings): Promise<McpSettings> {
    const parsed = settingsSchema.parse({ ...input, servers: input.servers.filter((server) => !removedServerIds.has(server.id)), updatedAt: new Date().toISOString() });
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.filePath);
    return parsed;
  }

  async view(): Promise<McpSettingsView> {
    const settings = await this.load();
    const readiness = await Promise.all(settings.servers.map((server) => this.readiness(server)));
    return { ...settings, readiness };
  }

  private async readiness(server: McpServerSetting): Promise<McpServerReadiness> {
    const runtimeAvailable = server.transport === 'http' ? /^https?:\/\//.test(server.url) : await commandExists(server.command);
    const requiredVariables = [...new Set([...server.requiredEnvVars, ...(server.bearerTokenEnvVar ? [server.bearerTokenEnvVar] : [])])];
    const missingEnvVars = requiredVariables.filter((name) => !process.env[name]);
    const ready = runtimeAvailable && missingEnvVars.length === 0;
    const message = !runtimeAvailable
      ? (server.transport === 'http' ? 'Укажите корректный HTTP-адрес.' : `Команда «${server.command || '—'}» не найдена.`)
      : missingEnvVars.length ? `Не заданы переменные: ${missingEnvVars.join(', ')}.` : 'Готов к подключению.';
    return { id: server.id, ready, runtimeAvailable, missingEnvVars, message };
  }
}
