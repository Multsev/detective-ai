import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaseMaterial, ResearchDocument } from '../../shared/domain.js';

function safeExtension(fileName: string, kind: ResearchDocument['kind']): string {
  if (kind === 'pdf') return '.pdf';
  if (kind === 'word') return '.docx';
  if (kind === 'spreadsheet') return '.xlsx';
  if (kind === 'text') return '.txt';
  return path.extname(fileName).toLowerCase() === '.markdown' ? '.markdown' : '.md';
}

function assertStorageKey(storageKey: string): void {
  if (!/^[a-f0-9]{64}\.(pdf|md|markdown|txt|docx|xlsx)$/.test(storageKey)) throw new Error('Некорректный идентификатор материала.');
}

export class CaseMaterialStore {
  private readonly materialsDirectory: string;

  constructor(dataDirectory = path.join(process.cwd(), 'data')) {
    this.materialsDirectory = path.join(dataDirectory, 'materials');
  }

  async storeFile(caseId: string, entityId: string, input: { originalName: string; kind: ResearchDocument['kind']; mimeType: ResearchDocument['mediaType']; buffer: Buffer }): Promise<CaseMaterial> {
    const fingerprint = createHash('sha256').update(input.buffer).digest('hex');
    const storageKey = `${fingerprint}${safeExtension(input.originalName, input.kind)}`;
    await mkdir(this.materialsDirectory, { recursive: true });
    try {
      await writeFile(path.join(this.materialsDirectory, storageKey), input.buffer, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
    const now = new Date().toISOString();
    return {
      id: `material-${randomUUID()}`,
      entityId,
      kind: input.kind,
      name: path.basename(input.originalName),
      mimeType: input.mimeType,
      fingerprint,
      storageKey,
      size: input.buffer.byteLength,
      revision: 1,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
  }

  createNote(entityId: string, name: string, content: string): CaseMaterial {
    const normalizedContent = content.trim();
    const now = new Date().toISOString();
    return {
      id: `material-${randomUUID()}`,
      entityId,
      kind: 'note',
      name: name.trim() || 'Заметка',
      mimeType: 'text/markdown',
      fingerprint: createHash('sha256').update(normalizedContent).digest('hex'),
      content: normalizedContent,
      size: Buffer.byteLength(normalizedContent, 'utf8'),
      revision: 1,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
  }

  async read(material: CaseMaterial): Promise<Buffer> {
    if (material.kind === 'note') return Buffer.from(material.content ?? '', 'utf8');
    if (!material.storageKey) throw new Error('Файл материала не найден.');
    assertStorageKey(material.storageKey);
    return readFile(path.join(this.materialsDirectory, material.storageKey));
  }
}
