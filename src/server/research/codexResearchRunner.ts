import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { InvestigationCase, InvestigationEntity, ResearchResult, ResearchStreamEvent } from '../../shared/domain.js';
import { researchJsonSchema, researchResultSchema } from './researchSchema.js';

const investigatorInstructions = `
Ты — исследователь открытых источников для графа связей. Проведи живой поиск в интернете
по указанной карточке и верни только JSON по предоставленной схеме.

Используй законно доступные публичные источники. Не собирай домашние адреса, личные телефоны,
документы, номера счетов, сведения о семье и другие чувствительные персональные данные.
Сначала разреши идентичность и не смешивай однофамильцев. Каждая связь должна иметь источник.
Отсутствие результата означает unknown, а не опровержение. Не делай выводов о виновности.

Статусы: official — первичный официальный источник; corroborated — минимум два независимых
источника; probable — подтверждение неполное; hypothesis — направление проверки;
contradicted — достоверные источники расходятся; unknown — данных недостаточно.
Не используй user_asserted для результатов веб-поиска.

Используй существующие ID сущностей. Для новых карточек создавай короткие URL-safe ID.
Связи могут ссылаться только на существующие ID или на ID из candidateEntities.
Источники должны содержать точные публичные URL.
`.trim();

function describeCliEvent(rawLine: string): ResearchStreamEvent | undefined {
  try {
    const event = JSON.parse(rawLine) as { type?: string; item?: { type?: string; query?: string; text?: string; command?: string } };
    if (event.type === 'thread.started') return { type: 'status', stage: 'starting', message: 'Codex создал исследовательскую сессию.' };
    if (event.type === 'turn.started') return { type: 'status', stage: 'planning', message: 'Анализирую карточку и формирую план поиска.' };
    if (event.type === 'item.started' && event.item?.type === 'web_search') {
      return { type: 'status', stage: 'searching', message: event.item.query ? `Ищу: ${event.item.query}` : 'Выполняю поиск в открытых источниках.' };
    }
    if (event.type === 'item.completed' && event.item?.type === 'web_search') {
      return { type: 'status', stage: 'sources', message: 'Источник изучен, проверяю утверждения.' };
    }
    if (event.type === 'item.started' && event.item?.type === 'mcp_tool_call') {
      return { type: 'status', stage: 'sources', message: 'Запрашиваю подключённый источник данных.' };
    }
    if (event.type === 'turn.completed') return { type: 'status', stage: 'structuring', message: 'Поиск завершён, строю граф предложений.' };
    if (event.type === 'turn.failed' || event.type === 'error') return { type: 'status', stage: 'warning', message: 'Codex сообщил о проблеме во время исследования.' };
  } catch {
    return undefined;
  }
  return undefined;
}

export class CodexResearchRunner {
  constructor(private readonly executablePath: string, private readonly workingDirectory = process.cwd()) {}

  async investigate(
    focusEntity: InvestigationEntity,
    investigationCase: InvestigationCase,
    researchQuestion: string,
    emit: (event: ResearchStreamEvent) => void,
  ): Promise<ResearchResult> {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'detective-ai-'));
    const schemaPath = path.join(temporaryDirectory, 'research-schema.json');
    const outputPath = path.join(temporaryDirectory, 'research-result.json');
    await writeFile(schemaPath, JSON.stringify(researchJsonSchema), 'utf8');

    const compactCase = {
      title: investigationCase.title,
      entities: investigationCase.entities.map(({ id, type, title, subtitle, summary }) => ({ id, type, title, subtitle, summary })),
      relations: investigationCase.relations.map(({ sourceId, targetId, label, status }) => ({ sourceId, targetId, label, status })),
    };
    const prompt = `${investigatorInstructions}\n\nФокусная карточка:\n${JSON.stringify(focusEntity)}\n\nТекущий граф:\n${JSON.stringify(compactCase)}\n\nВопрос пользователя:\n${researchQuestion || 'Найди связанные компании, людей, документы, события и проверяемые отношения.'}`;

    emit({ type: 'status', stage: 'starting', message: 'Запускаю Codex CLI в безопасном режиме только для чтения.' });

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(this.executablePath, [
          '--search',
          '--ask-for-approval', 'never',
          'exec',
          '--json',
          '--ephemeral',
          '--sandbox', 'read-only',
          '--cd', this.workingDirectory,
          '--output-schema', schemaPath,
          '--output-last-message', outputPath,
          prompt,
        ], { cwd: this.workingDirectory, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

        let stdoutBuffer = '';
        let stderrTail = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdoutBuffer += chunk;
          const lines = stdoutBuffer.split('\n');
          stdoutBuffer = lines.pop() ?? '';
          for (const line of lines) {
            const event = describeCliEvent(line);
            if (event) emit(event);
          }
        });
        child.stderr.on('data', (chunk: string) => {
          stderrTail = `${stderrTail}${chunk}`.slice(-4_000);
        });
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderrTail.trim() || `Codex CLI завершился с кодом ${code}.`));
        });
      });

      const parsed = researchResultSchema.parse(JSON.parse(await readFile(outputPath, 'utf8')));
      const accessedAt = new Date().toISOString().slice(0, 10);
      return { ...parsed, sources: parsed.sources.map((source) => ({ ...source, accessedAt })) };
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
