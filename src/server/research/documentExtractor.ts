import { createHash } from 'node:crypto';
import path from 'node:path';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { ResearchDocument } from '../../shared/domain.js';
import { getResearchFileDefinition, researchFileFormatSummary } from '../../shared/researchFileTypes.js';

export const maximumResearchFileBytes = 24 * 1024 * 1024;
export const maximumResearchDocumentCharacters = 180_000;

export class DocumentExtractionError extends Error {}

function safeFileName(fileName: string): string {
  return path.basename(fileName).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'document';
}

function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1251').decode(buffer);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

async function extractWordText(buffer: Buffer): Promise<string> {
  try {
    return (await mammoth.extractRawText({ buffer })).value;
  } catch (error) {
    throw new DocumentExtractionError(`Не удалось прочитать Word-документ: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
  }
}

async function extractSpreadsheetText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  try {
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);
  } catch (error) {
    throw new DocumentExtractionError(`Не удалось прочитать таблицу Excel: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
  }
  const sections: string[] = [];
  workbook.eachSheet((worksheet) => {
    const rows: string[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(cell.text.trim()));
      while (cells.at(-1) === '') cells.pop();
      if (cells.some(Boolean)) rows.push(cells.join('\t'));
    });
    if (rows.length) sections.push(`[Лист: ${worksheet.name}]\n${rows.join('\n')}`);
  });
  return sections.join('\n\n');
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
  if (input.buffer.length > maximumResearchFileBytes) throw new DocumentExtractionError('Файл превышает ограничение 24 МБ.');

  const fileName = safeFileName(input.originalName);
  const extension = path.extname(fileName).toLowerCase();
  const definition = getResearchFileDefinition(fileName, input.mimeType);
  if (!definition) throw new DocumentExtractionError(`Этот формат пока не поддерживается. Выберите ${researchFileFormatSummary}.`);

  let rawText: string;
  try {
    switch (definition.kind) {
      case 'pdf': rawText = await extractPdfText(input.buffer); break;
      case 'word': rawText = await extractWordText(input.buffer); break;
      case 'spreadsheet': rawText = await extractSpreadsheetText(input.buffer); break;
      case 'text': rawText = ['.html', '.htm'].includes(extension) ? htmlToText(decodeText(input.buffer)) : decodeText(input.buffer); break;
      case 'markdown': rawText = decodeText(input.buffer); break;
    }
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    throw new DocumentExtractionError(`Не удалось извлечь текст из файла: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
  }
  const normalized = normalizeText(rawText);
  return {
    fileName,
    kind: definition.kind,
    mediaType: definition.mediaType,
    text: normalized.text,
    truncated: normalized.truncated,
    sha256: createHash('sha256').update(input.buffer).digest('hex'),
  };
}
