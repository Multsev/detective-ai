import { afterEach, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectCodex } from '../src/server/codex/codexDetector.js';

const originalPath = process.env.PATH;
const originalOverride = process.env.CODEX_CLI_PATH;

afterEach(() => {
  process.env.PATH = originalPath;
  if (originalOverride === undefined) delete process.env.CODEX_CLI_PATH;
  else process.env.CODEX_CLI_PATH = originalOverride;
});

describe('Codex CLI detection', () => {
  it('returns manual mode when no executable exists', async () => {
    process.env.PATH = '/directory-that-does-not-exist';
    delete process.env.CODEX_CLI_PATH;
    const status = await detectCodex();
    expect(status.ready).toBe(false);
    expect(status.installed).toBe(false);
  });

  it('checks version and login state of an executable', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'fake-codex-'));
    const executable = path.join(directory, 'codex');
    await writeFile(executable, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 9.9.9"; exit 0; fi\nif [ "$1" = "login" ]; then echo "Logged in using ChatGPT"; exit 0; fi\nexit 1\n');
    await chmod(executable, 0o755);
    process.env.PATH = directory;
    delete process.env.CODEX_CLI_PATH;
    try {
      const status = await detectCodex();
      expect(status.ready).toBe(true);
      expect(status.version).toContain('9.9.9');
      expect(status.authMessage).toContain('Logged in');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
