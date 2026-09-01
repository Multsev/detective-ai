import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { InvestigationCase } from '../../shared/domain.js';
import { createSeedCase } from '../../shared/seed.js';

export class CaseStore {
  private readonly filePath: string;

  constructor(dataDirectory = path.join(process.cwd(), 'data')) {
    this.filePath = path.join(dataDirectory, 'case.json');
  }

  async load(): Promise<InvestigationCase> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as InvestigationCase;
    } catch (error) {
      const missingFile = error instanceof Error && 'code' in error && error.code === 'ENOENT';
      if (!missingFile) throw error;

      const seed = createSeedCase();
      await this.save(seed);
      return seed;
    }
  }

  async save(investigationCase: InvestigationCase): Promise<InvestigationCase> {
    const savedCase = { ...investigationCase, updatedAt: new Date().toISOString() };
    await mkdir(path.dirname(this.filePath), { recursive: true });

    // Atomic replacement prevents a partially written case after an interrupted save.
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(savedCase, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.filePath);
    return savedCase;
  }
}
