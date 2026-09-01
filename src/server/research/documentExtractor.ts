import { createHash } from 'node:crypto';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import type { ResearchDocument } from '../../shared/domain.js';

export const maximumResearchFileBytes = 12 * 1024 * 1024;
export const maximumResearchDocumentCharacters = 180_000;

export class DocumentExtractionError extends Error {}

const markdownExtensions = new Set(['.md', '.markdown']);

function safeFileName(fileName: string): string {
  return path.basename(fileName).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'document';
}

function normalizeText(text: string): { text: string; truncated: boolean } {
  const normalized = text.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) throw new DocumentExtractionError('В документе не найден текст. Для сканированного PDF потребуется OCR.');
  if (normalized.length <= maximumResearchDocumentCharacters) return { text: normalized, truncated: false };
  return { text: `${normalized.slice(0, maximumResearchDocumentCharacters)}\n\n[Документ сокращён приложением из-за ограничения контекста.]`, truncated: true };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new DocumentExtractionError('Файл имеет расширение PDF, но не содержит корректной сигнатуры PDF.');
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text;
  } catch (error) {
    throw new DocumentExtractionError(`Не удалось прочитать PDF: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
  } finally {
    await parser.destroy();
  }
}

export async function extractResearchDocument(input: { originalName: string; mimeType: string; buffer: Buffer }): Promise<ResearchDocument> {
  if (!input.buffer.length) throw new DocumentExtractionError('Загруженный файл пуст.');
  if (input.buffer.length > maximumResearchFileBytes) throw new DocumentExtractionError('Файл превышает ограничение 12 МБ.');

  const fileName = safeFileName(input.originalName);
  const extension = path.extname(fileName).toLowerCase();
  const isPdf = extension === '.pdf' && (input.mimeType === 'application/pdf' || input.mimeType === 'application/octet-stream');
  const isMarkdown = markdownExtensions.has(extension) && ['text/markdown', 'text/plain', 'application/octet-stream'].includes(input.mimeType);
  if (!isPdf && !isMarkdown) throw new DocumentExtractionError('Поддерживаются только PDF, Markdown (.md) и .markdown.');

  let rawText: string;
  try {
    rawText = isPdf ? await extractPdfText(input.buffer) : new TextDecoder('utf-8', { fatal: true }).decode(input.buffer);
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    throw new DocumentExtractionError('Markdown-файл должен быть корректным UTF-8 текстом.');
  }
  const normalized = normalizeText(rawText);
  return {
    fileName,
    mediaType: isPdf ? 'application/pdf' : 'text/markdown',
    text: normalized.text,
    truncated: normalized.truncated,
    sha256: createHash('sha256').update(input.buffer).digest('hex'),
  };
}
