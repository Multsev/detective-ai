import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CaseStore } from '../src/server/storage/caseStore';
import { createSeedCase } from '../src/shared/seed';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'detective-ai-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('CaseStore', () => {
  it('creates numbered cases in separate files', async () => {
    const dataDirectory = await createTemporaryDirectory();
    const store = new CaseStore(dataDirectory);

    const firstList = await store.list();
    const secondCase = await store.create({ subject: 'Анна Лебедева', entityType: 'person' });
    const thirdCase = await store.create({ subject: 'ООО Вектор', entityType: 'company' });

    expect(firstList[0].title).toBe('Дело № 0001 — Иван Морозов');
    expect(secondCase.id).toBe('case-0002-anna-lebedeva');
    expect(secondCase.title).toBe('Дело № 0002 — Анна Лебедева');
    expect(secondCase.defaultSubjectEntityId).toBe(secondCase.entities[0].id);
    expect(secondCase.researchSubjectEntityId).toBe(secondCase.entities[0].id);
    expect(thirdCase.id).toBe('case-0003-ooo-vektor');
    expect((await store.list()).map((item) => item.caseNumber)).toEqual([1, 2, 3]);
    await expect(stat(path.join(dataDirectory, 'cases', `${secondCase.id}.json`))).resolves.toBeDefined();
    await expect(stat(path.join(dataDirectory, 'cases', `${thirdCase.id}.json`))).resolves.toBeDefined();
  });

  it('saves one case without changing another case file', async () => {
    const dataDirectory = await createTemporaryDirectory();
    const store = new CaseStore(dataDirectory);
    const firstCase = await store.load();
    const secondCase = await store.create({ subject: 'Бета', entityType: 'company' });
    const secondFile = path.join(dataDirectory, 'cases', `${secondCase.id}.json`);
    const secondBefore = await readFile(secondFile, 'utf8');

    await store.save({ ...firstCase, subtitle: 'Обновлённое расследование' });

    expect((await store.load(firstCase.id)).subtitle).toBe('Обновлённое расследование');
    expect(await readFile(secondFile, 'utf8')).toBe(secondBefore);
  });

  it('migrates the legacy single file without deleting it', async () => {
    const dataDirectory = await createTemporaryDirectory();
    const legacyCase = createSeedCase();
    const { caseNumber: _caseNumber, subject: _subject, defaultSubjectEntityId: _defaultSubjectEntityId, researchSubjectEntityId: _researchSubjectEntityId, ...legacyShape } = legacyCase;
    await writeFile(path.join(dataDirectory, 'case.json'), JSON.stringify(legacyShape), 'utf8');

    const store = new CaseStore(dataDirectory);
    const migrated = await store.load();

    expect(migrated.id).toBe('case-0001-ivan-morozov');
    expect(migrated.caseNumber).toBe(1);
    expect(migrated.subject).toBe('Иван Морозов');
    expect(migrated.defaultSubjectEntityId).toBe('ivan-morozov');
    expect(migrated.researchSubjectEntityId).toBe('ivan-morozov');
    await expect(readFile(path.join(dataDirectory, 'case.json'), 'utf8')).resolves.toContain('case-black-portfolio');
  });
});
