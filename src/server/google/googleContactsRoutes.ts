import type { Express } from 'express';
import { z } from 'zod';
import { GoogleContactsService } from './googleContactsService.js';

const callbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1),
  error: z.string().optional(),
});

function oauthResultPage(status: 'connected' | 'error', message: string): string {
  const title = status === 'connected' ? 'Google Контакты подключены' : 'Не удалось подключить Google';
  const safeTitle = title.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
  const safeMessage = message.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
  const serializedMessage = JSON.stringify(message).replace(/</g, '\\u003c');
  const closeAction = status === 'connected' ? 'setTimeout(()=>window.close(),700);' : '';
  const closeButton = status === 'error' ? '<button type="button" onclick="window.close()">Закрыть окно</button>' : '';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeTitle}</title><style>body{display:grid;min-height:100vh;margin:0;place-items:center;color:#e9e2d4;background:#111b22;font:16px system-ui}.card{max-width:520px;margin:20px;padding:32px;border:1px solid #9b743b;background:#18242c;text-align:center}.mark{display:grid;width:48px;height:48px;margin:0 auto 18px;place-items:center;border:2px solid ${status === 'connected' ? '#65a878' : '#b65358'};border-radius:50%;font-size:25px}h1{margin:0 0 10px;font:700 24px Georgia}p{margin:0;color:#c3cbca;line-height:1.5}button{margin-top:24px;padding:10px 18px;border:1px solid #bd914d;background:#d8a950;color:#17130d;font:700 14px system-ui;cursor:pointer}</style></head><body><main class="card"><div class="mark">${status === 'connected' ? '✓' : '!'}</div><h1>${safeTitle}</h1><p>${safeMessage}</p>${closeButton}</main><script>if(window.opener){window.opener.postMessage({type:'detective-google-oauth',status:'${status}',message:${serializedMessage}},'*');${closeAction}}</script></body></html>`;
}

export function registerGoogleContactsRoutes(app: Express, service: GoogleContactsService): void {
  app.get('/api/google/status', async (_request, response, next) => {
    try { response.setHeader('Cache-Control', 'no-store'); response.json(await service.status()); } catch (error) { next(error); }
  });

  app.get('/api/google/oauth/start', (_request, response, next) => {
    try { response.redirect(service.createAuthorizationUrl()); } catch (error) { next(error); }
  });

  app.get('/api/google/oauth/callback', async (request, response) => {
    try {
      const { code, state, error } = callbackSchema.parse(request.query);
      if (error || !code) throw new Error(error === 'access_denied' ? 'Доступ не предоставлен.' : 'Google не вернул код авторизации.');
      await service.completeAuthorization(code, state);
      response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
      response.type('html').send(oauthResultPage('connected', 'Можно закрыть это окно и вернуться к Detective AI.'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Повторите подключение из настроек.';
      service.recordAuthorizationFailure(message);
      console.error(`Google OAuth callback failed: ${message}`);
      response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
      response.status(400).type('html').send(oauthResultPage('error', message));
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
