import type { InvestigationCase } from '../../shared/domain';

export const detectiveCaseFileVersion = 1;

interface DetectiveCaseFile {
  format: 'detective-ai-case';
  version: number;
  exportedAt: string;
  investigationCase: InvestigationCase;
}

export function serializeCaseFile(investigationCase: InvestigationCase): string {
  const payload: DetectiveCaseFile = {
    format: 'detective-ai-case',
    version: detectiveCaseFileVersion,
    exportedAt: new Date().toISOString(),
    investigationCase,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function parseCaseFile(contents: string): InvestigationCase {
  const parsed = JSON.parse(contents) as Partial<DetectiveCaseFile> | InvestigationCase;
  const investigationCase = 'investigationCase' in parsed ? parsed.investigationCase : parsed as InvestigationCase;
  if (!investigationCase || !investigationCase.id || !investigationCase.title || !Array.isArray(investigationCase.entities) || !Array.isArray(investigationCase.relations) || !Array.isArray(investigationCase.sources)) {
    throw new Error('Файл не содержит корректного дела Detective AI.');
  }
  return investigationCase;
}

export function caseFileName(investigationCase: InvestigationCase): string {
  const safeTitle = investigationCase.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${safeTitle || 'Расследование'}.detective`;
}

export function downloadCaseFile(investigationCase: InvestigationCase): void {
  const blob = new Blob([serializeCaseFile(investigationCase)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = caseFileName(investigationCase);
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // The browser needs the object URL until it has accepted the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
