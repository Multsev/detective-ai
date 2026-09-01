import express from 'express';
import path from 'node:path';
import { z } from 'zod';
import type { InvestigationCase } from '../shared/domain.js';
import { CaseStore } from './storage/caseStore.js';
import { ResearchAgent } from './research/researchAgent.js';

const researchRequestSchema = z.object({
  entityId: z.string().min(1),
  question: z.string().max(1200).default(''),
});

export function createApp(options: { store: CaseStore; researchAgent?: ResearchAgent; model: string }) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, aiConfigured: Boolean(options.researchAgent), model: options.model });
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

  app.post('/api/research', async (request, response, next) => {
    try {
      if (!options.researchAgent) {
        response.status(503).json({ error: 'AI-поиск не настроен. Добавьте OPENAI_API_KEY в файл .env и перезапустите сервер.' });
        return;
      }

      const { entityId, question } = researchRequestSchema.parse(request.body);
      const investigationCase = await options.store.load();
      const focusEntity = investigationCase.entities.find((entity) => entity.id === entityId);
      if (!focusEntity) {
        response.status(404).json({ error: 'Карточка для исследования не найдена.' });
        return;
      }

      response.json(await options.researchAgent.investigate(focusEntity, investigationCase, question));
    } catch (error) {
      next(error);
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
