import type { Express } from 'express';
import { z } from 'zod';
import { GoogleContactsService } from './googleContactsService.js';

const callbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export function registerGoogleContactsRoutes(app: Express, service: GoogleContactsService): void {
  app.get('/api/google/status', async (_request, response, next) => {
    try { response.setHeader('Cache-Control', 'no-store'); response.json(await service.status()); } catch (error) { next(error); }
  });

  app.get('/api/google/oauth/start', (_request, response, next) => {
    try { response.redirect(service.createAuthorizationUrl()); } catch (error) { next(error); }
  });

  app.get('/api/google/oauth/callback', async (request, response) => {
    try {
      const { code, state } = callbackSchema.parse(request.query);
      await service.completeAuthorization(code, state);
      response.redirect('/?google=connected');
    } catch {
      response.redirect('/?google=error');
    }
  });

  app.get('/api/google/contacts', async (_request, response, next) => {
    try {
      response.setHeader('Cache-Control', 'no-store');
      const status = await service.status();
      if (!status.configured || !status.connected) {
        response.status(status.configured ? 401 : 503).json({ error: status.message });
        return;
      }
      response.json(await service.listContacts());
    } catch (error) { next(error); }
  });

  app.delete('/api/google/connection', async (_request, response, next) => {
    try {
      await service.disconnect();
      response.json(await service.status());
    } catch (error) { next(error); }
  });
}
