import express from 'express';
import path from 'node:path';
import { z } from 'zod';
import type { InvestigationCase } from '../shared/domain.js';
import { detectCodex } from './codex/codexDetector.js';
import { CaseStore } from './storage/caseStore.js';
import { CodexResearchRunner } from './research/codexResearchRunner.js';

const researchRequestSchema = z.object({
  entityId: z.string().min(1),
  question: z.string().max(1200).default(''),
});

export function createApp(options: { store: CaseStore }) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get(['/api/health', '/api/codex/status'], async (_request, response, next) => {
    try {
      response.json({ ok: true, codex: await detectCodex() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/case', async (_request, response, next) => {
    try {
      response.json(await options.store.load());
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/case', async (request, response, next) => {
    try {
      const investigationCase = request.body as InvestigationCase;
      if (!investigationCase?.id || !Array.isArray(investigationCase.entities) || !Array.isArray(investigationCase.relations)) {
        response.status(400).json({ error: 'Некорректная структура дела.' });
        return;
      }
      response.json(await options.store.save(investigationCase));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/research/stream', async (request, response) => {
    try {
      const { entityId, question } = researchRequestSchema.parse(request.body);
      const investigationCase = await options.store.load();
      const focusEntity = investigationCase.entities.find((entity) => entity.id === entityId);
      if (!focusEntity) {
        response.status(404).json({ error: 'Карточка для исследования не найдена.' });
        return;
      }

      const codex = await detectCodex();
      if (!codex.ready) {
        response.status(503).json({ error: codex.installed ? 'Codex CLI найден, но требуется авторизация.' : 'Codex CLI не найден. Ручная доска доступна, AI-поиск отключён.' });
        return;
      }

      response.status(200);
      response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();
      const emit = (event: unknown) => response.write(`${JSON.stringify(event)}\n`);
      const runner = new CodexResearchRunner(codex.path);
      const result = await runner.investigate(focusEntity, investigationCase, question, emit);
      emit({ type: 'result', result });
      response.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка исследования.';
      if (response.headersSent) {
        response.write(`${JSON.stringify({ type: 'error', message })}\n`);
        response.end();
      } else {
        response.status(error instanceof z.ZodError ? 400 : 500).json({ error: message });
      }
    }
  });

  const clientDirectory = path.join(process.cwd(), 'dist');
  app.use(express.static(clientDirectory));
  app.get(/^(?!\/api).*/, (_request, response) => response.sendFile(path.join(clientDirectory, 'index.html')));

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка сервера.';
    response.status(error instanceof z.ZodError ? 400 : 500).json({ error: message });
  });

  return app;
}
