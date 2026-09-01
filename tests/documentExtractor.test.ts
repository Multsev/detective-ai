import { describe, expect, it } from 'vitest';
import { extractResearchDocument } from '../src/server/research/documentExtractor.js';

function createTinyPdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

describe('research document extraction', () => {
  it('reads UTF-8 Markdown and records a content hash', async () => {
    const result = await extractResearchDocument({ originalName: '../report.md', mimeType: 'text/markdown', buffer: Buffer.from('# Report\nAcme relation') });
    expect(result.fileName).toBe('report.md');
    expect(result.text).toContain('Acme relation');
    expect(result.sha256).toHaveLength(64);
  });

  it('extracts text from a real PDF structure', async () => {
    const result = await extractResearchDocument({ originalName: 'report.pdf', mimeType: 'application/pdf', buffer: createTinyPdf('Acme report') });
    expect(result.mediaType).toBe('application/pdf');
    expect(result.text).toContain('Acme report');
  });

  it('rejects disguised and unsupported files', async () => {
    await expect(extractResearchDocument({ originalName: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') })).rejects.toThrow('сигнатуры PDF');
    await expect(extractResearchDocument({ originalName: 'image.png', mimeType: 'image/png', buffer: Buffer.from('png') })).rejects.toThrow('Поддерживаются только');
  });
});
