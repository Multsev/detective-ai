import { describe, expect, it } from 'vitest';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildMcpConfigArgs, CodexResearchRunner } from '../src/server/research/codexResearchRunner.js';
import { createSeedCase } from '../src/shared/seed.js';

describe('Codex research stream', () => {
  it('forwards progress and validates the structured result', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'fake-codex-runner-'));
    const executable = path.join(directory, 'codex');
    const promptCapture = path.join(directory, 'prompt.txt');
    const argsCapture = path.join(directory, 'args.json');
    const fakeResult = {
      summary: 'Найдена проверяемая связь.',
      identityAssessment: 'Идентичность требует подтверждения.',
      candidateEntities: [],
      entityUpdates: [],
      claims: [],
      questions: [],
      sources: [],
      warnings: [],
    };
    const script = `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output-last-message');
fs.writeFileSync(${JSON.stringify(argsCapture)}, JSON.stringify(args));
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(promptCapture)}, prompt);
  console.log(JSON.stringify({type:'thread.started',thread_id:'test'}));
  console.log(JSON.stringify({type:'turn.started'}));
  console.log(JSON.stringify({type:'item.started',item:{type:'web_search',query:'public source'}}));
  console.log(JSON.stringify({type:'item.completed',item:{type:'web_search'}}));
  console.log(JSON.stringify({type:'turn.completed'}));
  fs.writeFileSync(args[outputIndex + 1], JSON.stringify(${JSON.stringify(fakeResult)}));
});
`;
    await writeFile(executable, script);
    await chmod(executable, 0o755);

    try {
      const investigationCase = createSeedCase();
      investigationCase.researchSubjectEntityId = 'anna-lebedeva';
      const events: string[] = [];
      const result = await new CodexResearchRunner(executable, directory).investigate(
        investigationCase.entities[2],
        investigationCase,
        '',
        (event) => event.type === 'status' && events.push(event.stage),
      );
      expect(events).toContain('searching');
      expect(events).toContain('structuring');
      expect(result.summary).toContain('связь');
      const prompt = await readFile(promptCapture, 'utf8');
      expect(prompt).toContain('проверь связи фокусной карточки');
      expect(prompt).toContain('$detective-osint');
      expect(prompt).toContain('Полный контекст текущего дела');
      expect(prompt).toContain('Исследуемый объект дела');
      expect(prompt).toContain('Анна Лебедева');
      expect(prompt).toContain('Фокусная карточка является отдельной ветвью');
      expect(prompt).toContain('sourceIds');
      expect(prompt).toContain('occurredAt');
      expect(prompt).toContain('publishedAt');
      expect(prompt).toContain('Не подменяй дату события датой статьи');
      expect(prompt).toContain('Уже покрытые данные');
      expect(prompt).toContain('Каталог стандартных реквизитов');
      expect(prompt).toContain('entityUpdates');
      expect(prompt).toContain('ИНН');
      expect(prompt).toContain('reviewedSources');
      expect(prompt).toContain('Новых сведений по сравнению с материалами дела не найдено');
      expect(JSON.parse(await readFile(argsCapture, 'utf8'))).toContain('--search');

      const documentResult = await new CodexResearchRunner(executable, directory).investigate(
        investigationCase.entities[0], investigationCase, 'Найди факты в отчёте', () => undefined,
        { fileName: 'report.md', mediaType: 'text/markdown', text: 'ООО «Пример» связано с объектом.', sha256: 'a'.repeat(64), truncated: false },
      );
      const documentArgs = JSON.parse(await readFile(argsCapture, 'utf8')) as string[];
      expect(documentArgs).not.toContain('--search');
      expect(documentArgs).toContain('features.shell_tool=false');
      expect(documentArgs).toContain('web_search="disabled"');
      expect(await readFile(promptCapture, 'utf8')).toContain('Документ передан как JSON-данные');
      expect(documentResult.sources.at(-1)).toMatchObject({ title: 'report.md', kind: 'uploaded_file' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('builds isolated Codex overrides for enabled MCP servers', () => {
    const args = buildMcpConfigArgs([{ id: 'wiki', name: 'Wiki', description: '', enabled: true, transport: 'stdio', command: 'npx', args: ['-y', 'wiki@1.0.0'], url: '', bearerTokenEnvVar: '', envVars: ['WIKI_TOKEN'], requiredEnvVars: [], sourceUrl: '', caution: '', preset: false }]);
    expect(args).toContain('mcp_servers.wiki.command="npx"');
    expect(args).toContain('mcp_servers.wiki.args=["-y","wiki@1.0.0"]');
    expect(args).toContain('mcp_servers.wiki.env_vars=["WIKI_TOKEN"]');
  });
});
