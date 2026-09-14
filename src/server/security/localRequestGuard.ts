import type { NextFunction, Request, Response } from 'express';

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);

function normalizedHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

export function isLoopbackHostname(value: string): boolean {
  return loopbackHosts.has(normalizedHostname(value));
}

export function isAllowedBrowserOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

export function applyLocalSecurityHeaders(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  next();
}

export function requireLocalRequest(request: Request, response: Response, next: NextFunction): void {
  if (!isLoopbackHostname(request.hostname)) {
    response.status(403).json({ error: 'Detective AI принимает запросы только с локального адреса.' });
    return;
  }
  if (!isAllowedBrowserOrigin(request.get('origin'))) {
    response.status(403).json({ error: 'Запрос с внешнего сайта отклонён.' });
    return;
  }
  if (request.path.startsWith('/api/')) response.setHeader('Cache-Control', 'no-store');
  next();
}
