import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CodexStatus } from '../../shared/domain.js';

const executeFile = promisify(execFile);

async function findCodexExecutable(): Promise<string> {
  const candidates = [
    process.env.CODEX_CLI_PATH,
    ...String(process.env.PATH ?? '').split(path.delimiter).map((directory) => path.join(directory, 'codex')),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through PATH until an executable candidate is found.
    }
  }
  return '';
}

export async function detectCodex(): Promise<CodexStatus> {
  const checkedAt = new Date().toISOString();
  const executablePath = await findCodexExecutable();
  if (!executablePath) {
    return {
      installed: false,
      authenticated: false,
      ready: false,
      path: '',
      version: '',
      authMessage: 'Codex CLI не найден в PATH.',
      checkedAt,
    };
  }

  try {
    const versionResult = await executeFile(executablePath, ['--version'], { timeout: 5_000 });
    const version = versionResult.stdout.trim() || versionResult.stderr.trim();
    try {
      const authResult = await executeFile(executablePath, ['login', 'status'], { timeout: 8_000 });
      const authMessage = `${authResult.stdout}\n${authResult.stderr}`.trim();
      return {
        installed: true,
        authenticated: true,
        ready: true,
        path: executablePath,
        version,
        authMessage,
        checkedAt,
      };
    } catch (error) {
      const authMessage = error instanceof Error && 'stderr' in error
        ? String(error.stderr).trim()
        : 'Codex CLI найден, но авторизация не подтверждена.';
      return {
        installed: true,
        authenticated: false,
        ready: false,
        path: executablePath,
        version,
        authMessage,
        checkedAt,
      };
    }
  } catch {
    return {
      installed: false,
      authenticated: false,
      ready: false,
      path: executablePath,
      version: '',
      authMessage: 'Файл Codex найден, но не запускается.',
      checkedAt,
    };
  }
}
