import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CaseMaterialStore } from '../src/server/storage/caseMaterialStore';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('CaseMaterialStore', () => {
  it('stores files by content hash and reads their original bytes', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'detective-materials-'));
    temporaryDirectories.push(directory);
    const store = new CaseMaterialStore(directory);
    const buffer = Buffer.from('# Материал дела');
    const first = await store.storeFile('case-1', 'entity-1', { originalName: 'report.md', mimeType: 'text/markdown', buffer });
    const second = await store.storeFile('case-1', 'entity-2', { originalName: 'copy.md', mimeType: 'text/markdown', buffer });

    expect(first.storageKey).toBe(second.storageKey);
    expect(await store.read(first)).toEqual(buffer);
  });

  it('creates a pending note with a stable fingerprint', () => {
    const store = new CaseMaterialStore('/tmp/not-used');
    const first = store.createNote('entity-1', 'Справка', '  Один и тот же текст  ');
    const second = store.createNote('entity-1', 'Копия', 'Один и тот же текст');
    expect(first.status).toBe('pending');
    expect(first.fingerprint).toBe(second.fingerprint);
  });
});
