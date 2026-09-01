import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { z } from 'zod';
import type { InvestigationCase, McpSettings } from '../shared/domain.js';
import { detectCodex } from './codex/codexDetector.js';
import { CaseStore } from './storage/caseStore.js';
import { CodexResearchRunner } from './research/codexResearchRunner.js';
import { McpSettingsStore } from './storage/mcpSettingsStore.js';
import { CaseMaterialStore } from './storage/caseMaterialStore.js';
import { DocumentExtractionError, extractResearchDocument, maximumResearchFileBytes } from './research/documentExtractor.js';
import { GoogleContactsService } from './google/googleContactsService.js';
import { registerGoogleContactsRoutes } from './google/googleContactsRoutes.js';

const researchRequestSchema = z.object({
  caseId: z.string().min(1),
  entityId: z.string().min(1),
  question: z.string().max(1200).default(''),
});

const relationshipResearchRequestSchema = z.object({
  caseId: z.string().min(1),
  entityIds: z.array(z.string().min(1)).min(2, 'Выберите минимум две карточки.').max(20, 'За один запуск можно выбрать не более 20 карточек.').transform((ids) => [...new Set(ids)]).refine((ids) => ids.length >= 2, 'Выберите минимум две разные карточки.'),
  question: z.string().max(1200).default(''),
});

const createCaseSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  entityType: z.enum(['person', 'company']),
});

const mcpSettingsInputSchema = z.object({
  servers: z.array(z.unknown()),
  updatedAt: z.string().default(''),
});

const noteMaterialSchema = z.object({
  name: z.string().trim().max(160).default('Заметка'),
  content: z.string().trim().min(1, 'Введите текст заметки.').max(120_000),
});

const materialResearchRequestSchema = researchRequestSchema.extend({
  materialId: z.string().min(1),
});

export function createApp(options: { store: CaseStore; materialStore?: CaseMaterialStore; mcpSettingsStore?: McpSettingsStore; googleContactsService?: GoogleContactsService }) {
  const app = express();
  const mcpSettingsStore = options.mcpSettingsStore ?? new McpSettingsStore();
  const materialStore = options.materialStore ?? new CaseMaterialStore();
  const documentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maximumResearchFileBytes, files: 1, fields: 4 } });
  app.use(express.json({ limit: '2mb' }));
  registerGoogleContactsRoutes(app, options.googleContactsService ?? new GoogleContactsService());

  app.get(['/api/health', '/api/codex/status'], async (_request, response, next) => {
    try {
      response.json({ ok: true, codex: await detectCodex() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/mcp/settings', async (_request, response, next) => {
    try {
      response.json(await mcpSettingsStore.view());
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/mcp/settings', async (request, response, next) => {
    try {
      const input = mcpSettingsInputSchema.parse(request.body);
      await mcpSettingsStore.save(input as McpSettings);
      response.json(await mcpSettingsStore.view());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/cases', async (_request, response, next) => {
    try {
      response.json(await options.store.list());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/cases', async (request, response, next) => {
    try {
      response.status(201).json(await options.store.create(createCaseSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/cases/import', async (request, response, next) => {
    try {
      const investigationCase = request.body as InvestigationCase;
      response.status(201).json(await options.store.importCase(investigationCase));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/cases/:caseId', async (request, response, next) => {
    try {
      response.json(await options.store.load(request.params.caseId));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/cases/:caseId', async (request, response, next) => {
    try {
      const investigationCase = request.body as InvestigationCase;
      if (!investigationCase?.id || investigationCase.id !== request.params.caseId || !Array.isArray(investigationCase.entities) || !Array.isArray(investigationCase.relations)) {
        response.status(400).json({ error: 'Некорректная структура дела.' });
        return;
      }
      response.json(await options.store.save(investigationCase));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/cases/:caseId/entities/:entityId/materials/file', documentUpload.single('file'), async (request, response, next) => {
    try {
      if (!request.file) {
        response.status(400).json({ error: 'Выберите документ, таблицу или текстовый файл.' });
        return;
      }
      const caseId = String(request.params.caseId);
      const entityId = String(request.params.entityId);
      const investigationCase = await options.store.load(caseId);
      if (!investigationCase.entities.some((entity) => entity.id === entityId)) {
        response.status(404).json({ error: 'Карточка для материала не найдена.' });
        return;
      }
      const extracted = await extractResearchDocument({ originalName: request.file.originalname, mimeType: request.file.mimetype, buffer: request.file.buffer });
      const existing = (investigationCase.materials ?? []).find((material) => material.entityId === entityId && material.fingerprint === extracted.sha256);
      if (existing) {
        response.json({ investigationCase, material: existing, duplicate: true });
        return;
      }
      const material = await materialStore.storeFile(caseId, entityId, {
        originalName: extracted.fileName,
        kind: extracted.kind,
        mimeType: extracted.mediaType,
        buffer: request.file.buffer,
      });
      const savedCase = await options.store.save({ ...investigationCase, materials: [...(investigationCase.materials ?? []), material] });
      response.status(201).json({ investigationCase: savedCase, material, duplicate: false });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/cases/:caseId/entities/:entityId/materials/note', async (request, response, next) => {
    try {
      const input = noteMaterialSchema.parse(request.body);
      const investigationCase = await options.store.load(request.params.caseId);
      if (!investigationCase.entities.some((entity) => entity.id === request.params.entityId)) {
        response.status(404).json({ error: 'Карточка для заметки не найдена.' });
        return;
      }
      const material = materialStore.createNote(request.params.entityId, input.name, input.content);
      const existing = (investigationCase.materials ?? []).find((candidate) => candidate.entityId === request.params.entityId && candidate.fingerprint === material.fingerprint);
      if (existing) {
        response.json({ investigationCase, material: existing, duplicate: true });
        return;
      }
      const savedCase = await options.store.save({ ...investigationCase, materials: [...(investigationCase.materials ?? []), material] });
      response.status(201).json({ investigationCase: savedCase, material, duplicate: false });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/cases/:caseId/materials/:materialId', async (request, response, next) => {
    try {
      const investigationCase = await options.store.load(request.params.caseId);
      const materials = (investigationCase.materials ?? []).filter((material) => material.id !== request.params.materialId);
      if (materials.length === (investigationCase.materials ?? []).length) {
        response.status(404).json({ error: 'Материал не найден.' });
        return;
      }
      response.json(await options.store.save({ ...investigationCase, materials }));
    } catch (error) {
      next(error);
    }
  });

  app.post(['/api/research/information/stream', '/api/research/stream'], async (request, response) => {
    try {
      const { caseId, entityId, question } = researchRequestSchema.parse(request.body);
      const investigationCase = await options.store.load(caseId);
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

      const mcpSettings = await mcpSettingsStore.load();
      const mcpView = await mcpSettingsStore.view();
      const unavailableEnabledServer = mcpSettings.servers.find((server) => server.enabled && !mcpView.readiness.find((item) => item.id === server.id)?.ready);
      if (unavailableEnabledServer) {
        const status = mcpView.readiness.find((item) => item.id === unavailableEnabledServer.id);
        response.status(503).json({ error: `MCP «${unavailableEnabledServer.name}» не готов: ${status?.message ?? 'проверьте настройки.'}` });
        return;
      }

      response.status(200);
      response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();
      const emit = (event: unknown) => response.write(`${JSON.stringify(event)}\n`);
      const runner = new CodexResearchRunner(codex.path, process.cwd(), mcpSettings);
      const result = await runner.investigateInformation(focusEntity, investigationCase, question, emit);
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

  app.post('/api/research/relationships/stream', async (request, response) => {
    try {
      const { caseId, entityIds, question } = relationshipResearchRequestSchema.parse(request.body);
      const investigationCase = await options.store.load(caseId);
      const requestedEntities = entityIds.map((entityId) => investigationCase.entities.find((entity) => entity.id === entityId));
      if (requestedEntities.some((entity) => !entity)) {
        response.status(404).json({ error: 'Одна или несколько карточек для поиска связей не найдены.' });
        return;
      }
      const focusEntities = requestedEntities.filter((entity): entity is InvestigationCase['entities'][number] => Boolean(entity));

      const codex = await detectCodex();
      if (!codex.ready) {
        response.status(503).json({ error: codex.installed ? 'Codex CLI найден, но требуется авторизация.' : 'Codex CLI не найден. Поиск связей отключён.' });
        return;
      }

      const mcpSettings = await mcpSettingsStore.load();
      const mcpView = await mcpSettingsStore.view();
      const unavailableEnabledServer = mcpSettings.servers.find((server) => server.enabled && !mcpView.readiness.find((item) => item.id === server.id)?.ready);
      if (unavailableEnabledServer) {
        const status = mcpView.readiness.find((item) => item.id === unavailableEnabledServer.id);
        response.status(503).json({ error: `MCP «${unavailableEnabledServer.name}» не готов: ${status?.message ?? 'проверьте настройки.'}` });
        return;
      }

      response.status(200);
      response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();
      const emit = (event: unknown) => response.write(`${JSON.stringify(event)}\n`);
      const runner = new CodexResearchRunner(codex.path, process.cwd(), mcpSettings);
      const result = await runner.investigateRelationships(focusEntities, investigationCase, question, emit);
      emit({ type: 'result', result });
      response.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка поиска связей.';
      if (response.headersSent) {
        response.write(`${JSON.stringify({ type: 'error', message })}\n`);
        response.end();
      } else {
        response.status(error instanceof z.ZodError ? 400 : 500).json({ error: message });
      }
    }
  });

  app.post('/api/research/material/stream', async (request, response) => {
    try {
      const { caseId, entityId, materialId, question } = materialResearchRequestSchema.parse(request.body);
      const investigationCase = await options.store.load(caseId);
      const focusEntity = investigationCase.entities.find((entity) => entity.id === entityId);
      const material = (investigationCase.materials ?? []).find((candidate) => candidate.id === materialId && candidate.entityId === entityId);
      if (!focusEntity || !material) {
        response.status(404).json({ error: 'Карточка или материал для исследования не найдены.' });
        return;
      }
      const codex = await detectCodex();
      if (!codex.ready) {
        response.status(503).json({ error: codex.installed ? 'Codex CLI найден, но требуется авторизация.' : 'Codex CLI не найден. Анализ материалов отключён.' });
        return;
      }
      const buffer = await materialStore.read(material);
      const document = await extractResearchDocument({ originalName: material.kind === 'note' ? `${material.name}.md` : material.name, mimeType: material.mimeType, buffer });
      response.status(200);
      response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();
      const emit = (event: unknown) => response.write(`${JSON.stringify(event)}\n`);
      emit({ type: 'status', stage: 'extracting', message: `Материал «${material.name}» подготовлен, начинаю анализ.` });
      if (document.truncated) emit({ type: 'status', stage: 'warning', message: 'Документ очень большой: анализируется первые 180 000 символов.' });
      const runner = new CodexResearchRunner(codex.path, process.cwd(), await mcpSettingsStore.load());
      emit({ type: 'result', result: await runner.investigateInformation(focusEntity, investigationCase, question, emit, document) });
      response.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка анализа материала.';
      if (response.headersSent) {
        response.write(`${JSON.stringify({ type: 'error', message })}\n`);
        response.end();
      } else {
        response.status(error instanceof z.ZodError || error instanceof DocumentExtractionError ? 400 : 500).json({ error: message });
      }
    }
  });

  app.post('/api/research/file/stream', documentUpload.single('file'), async (request, response) => {
    try {
      const { caseId, entityId, question } = researchRequestSchema.parse(request.body);
      if (!request.file) {
        response.status(400).json({ error: 'Выберите PDF или Markdown-файл.' });
        return;
      }
      const investigationCase = await options.store.load(caseId);
      const focusEntity = investigationCase.entities.find((entity) => entity.id === entityId);
      if (!focusEntity) {
        response.status(404).json({ error: 'Карточка для исследования не найдена.' });
        return;
      }

      const codex = await detectCodex();
      if (!codex.ready) {
        response.status(503).json({ error: codex.installed ? 'Codex CLI найден, но требуется авторизация.' : 'Codex CLI не найден. Анализ файла отключён.' });
        return;
      }

      const document = await extractResearchDocument({ originalName: request.file.originalname, mimeType: request.file.mimetype, buffer: request.file.buffer });

      response.status(200);
      response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();
      const emit = (event: unknown) => response.write(`${JSON.stringify(event)}\n`);
      emit({ type: 'status', stage: 'extracting', message: `Текст файла «${document.fileName}» извлечён, начинаю анализ.` });
      if (document.truncated) emit({ type: 'status', stage: 'warning', message: 'Документ очень большой: анализируется первые 180 000 символов.' });

      const runner = new CodexResearchRunner(codex.path, process.cwd(), await mcpSettingsStore.load());
      const result = await runner.investigateInformation(focusEntity, investigationCase, question, emit, document);
      emit({ type: 'result', result });
      response.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка анализа файла.';
      if (response.headersSent) {
        response.write(`${JSON.stringify({ type: 'error', message })}\n`);
        response.end();
      } else {
        response.status(error instanceof z.ZodError || error instanceof DocumentExtractionError ? 400 : 500).json({ error: message });
      }
    }
  });

  const clientDirectory = path.join(process.cwd(), 'dist');
  app.use(express.static(clientDirectory));
  app.get(/^(?!\/api).*/, (_request, response) => response.sendFile(path.join(clientDirectory, 'index.html')));

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error(error);
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'Файл превышает ограничение 24 МБ.'
      : error instanceof Error ? error.message : 'Неизвестная ошибка сервера.';
    response.status(error instanceof z.ZodError || error instanceof multer.MulterError || error instanceof DocumentExtractionError ? 400 : 500).json({ error: message });
  });

  return app;
}
