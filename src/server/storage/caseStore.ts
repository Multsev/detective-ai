import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaseSummary, CreateCaseInput, InvestigationCase, InvestigationEntity } from '../../shared/domain.js';
import { createSeedCase } from '../../shared/seed.js';

function slugify(value: string): string {
  const transliteration: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return value.toLowerCase().split('').map((letter) => transliteration[letter] ?? letter).join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 52) || 'investigation';
}

function createCaseId(caseNumber: number, subject: string): string {
  return `case-${String(caseNumber).padStart(4, '0')}-${slugify(subject)}`;
}

function createCaseTitle(caseNumber: number, subject: string): string {
  return `Дело № ${String(caseNumber).padStart(4, '0')} — ${subject}`;
}

function isSafeCaseId(id: string): boolean {
  return /^case-\d{4,}-[a-z0-9-]+$/.test(id);
}

export class CaseStore {
  private readonly legacyFilePath: string;
  private readonly casesDirectory: string;
  private initialized = false;

  constructor(dataDirectory = path.join(process.cwd(), 'data')) {
    this.legacyFilePath = path.join(dataDirectory, 'case.json');
    this.casesDirectory = path.join(dataDirectory, 'cases');
  }

  async list(): Promise<CaseSummary[]> {
    await this.ensureInitialized();
    const fileNames = (await readdir(this.casesDirectory)).filter((fileName) => fileName.endsWith('.json'));
    const cases = await Promise.all(fileNames.map(async (fileName) => JSON.parse(await readFile(path.join(this.casesDirectory, fileName), 'utf8')) as InvestigationCase));
    return cases.map((investigationCase) => ({
      id: investigationCase.id,
      caseNumber: investigationCase.caseNumber,
      subject: investigationCase.subject,
      title: investigationCase.title,
      updatedAt: investigationCase.updatedAt,
      entityCount: investigationCase.entities.length,
      relationCount: investigationCase.relations.length,
    })).sort((first, second) => first.caseNumber - second.caseNumber);
  }

  async load(id?: string): Promise<InvestigationCase> {
    await this.ensureInitialized();
    const resolvedId = id ?? (await this.list())[0]?.id;
    if (!resolvedId || !isSafeCaseId(resolvedId)) throw new Error('Некорректный идентификатор дела.');
    return JSON.parse(await readFile(this.filePath(resolvedId), 'utf8')) as InvestigationCase;
  }

  async create(input: CreateCaseInput): Promise<InvestigationCase> {
    const subject = input.subject.trim();
    if (!subject) throw new Error('Укажите фамилию, имя или название исследуемого объекта.');
    const summaries = await this.list();
    const nextNumber = Math.max(0, ...summaries.map((item) => item.caseNumber)) + 1;
    const id = createCaseId(nextNumber, subject);
    const focusEntity: InvestigationEntity = {
      id: `${input.entityType}-${slugify(subject)}`,
      type: input.entityType,
      title: subject,
      subtitle: input.entityType === 'person' ? 'Исследуемое лицо' : 'Исследуемая организация',
      summary: 'Исходная карточка нового расследования. Добавьте известные факты или запустите поиск.',
      position: { x: 360, y: 220 },
      facts: [],
    };
    return this.writeCase({
      id,
      caseNumber: nextNumber,
      subject,
      title: createCaseTitle(nextNumber, subject),
      subtitle: 'Активное расследование',
      entities: [focusEntity],
      relations: [],
      sources: [],
      updatedAt: new Date().toISOString(),
    });
  }

  async save(investigationCase: InvestigationCase): Promise<InvestigationCase> {
    await this.ensureInitialized();
    if (!isSafeCaseId(investigationCase.id)) throw new Error('Некорректный идентификатор дела.');
    return this.writeCase(investigationCase);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.casesDirectory, { recursive: true });
    const existingFiles = (await readdir(this.casesDirectory)).filter((fileName) => fileName.endsWith('.json'));
    if (existingFiles.length === 0) {
      let initialCase: InvestigationCase;
      try {
        initialCase = JSON.parse(await readFile(this.legacyFilePath, 'utf8')) as InvestigationCase;
      } catch (error) {
        const missingFile = error instanceof Error && 'code' in error && error.code === 'ENOENT';
        if (!missingFile) throw error;
        initialCase = createSeedCase();
      }
      const subject = initialCase.subject || initialCase.entities.find((entity) => entity.type === 'person' || entity.type === 'company')?.title || 'Новое расследование';
      initialCase = { ...initialCase, id: createCaseId(1, subject), caseNumber: 1, subject, title: createCaseTitle(1, subject) };
      await this.writeCase(initialCase);
    }
    this.initialized = true;
  }

  private filePath(id: string): string {
    return path.join(this.casesDirectory, `${id}.json`);
  }

  private async writeCase(investigationCase: InvestigationCase): Promise<InvestigationCase> {
    const savedCase = { ...investigationCase, updatedAt: new Date().toISOString() };
    await mkdir(this.casesDirectory, { recursive: true });
    const targetPath = this.filePath(savedCase.id);
    const temporaryPath = `${targetPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(savedCase, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, targetPath);
    return savedCase;
  }
}
