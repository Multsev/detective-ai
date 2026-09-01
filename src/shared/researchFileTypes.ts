export const researchFileKinds = ['pdf', 'markdown', 'text', 'word', 'spreadsheet'] as const;
export type ResearchFileKind = (typeof researchFileKinds)[number];

export const researchFileMediaTypes = [
  'application/pdf',
  'text/markdown',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;
export type ResearchFileMediaType = (typeof researchFileMediaTypes)[number];

interface ResearchFileDefinition {
  kind: ResearchFileKind;
  mediaType: ResearchFileMediaType;
  extensions: readonly string[];
}

export const researchFileDefinitions: readonly ResearchFileDefinition[] = [
  { kind: 'pdf', mediaType: 'application/pdf', extensions: ['.pdf'] },
  { kind: 'markdown', mediaType: 'text/markdown', extensions: ['.md', '.markdown'] },
  {
    kind: 'text',
    mediaType: 'text/plain',
    extensions: ['.txt', '.text', '.log', '.csv', '.tsv', '.json', '.jsonl', '.xml', '.html', '.htm', '.yaml', '.yml', '.ini', '.conf', '.sql'],
  },
  {
    kind: 'word',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['.docx'],
  },
  {
    kind: 'spreadsheet',
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['.xlsx', '.xlsm'],
  },
];

export const researchFileAccept = [
  ...researchFileDefinitions.flatMap((definition) => definition.extensions),
  ...researchFileDefinitions.flatMap((definition) => definition.mediaType),
  'text/*',
].join(',');

export const researchFileFormatSummary = 'PDF, Word, Excel, Markdown или текст';

function extensionOf(fileName: string): string {
  const match = /(?:^|[/\\])[^/\\]*?(\.[^./\\]+)$/.exec(fileName.toLowerCase());
  return match?.[1] ?? '';
}

export function getResearchFileDefinition(fileName: string, mimeType = ''): ResearchFileDefinition | undefined {
  const extension = extensionOf(fileName);
  const byExtension = researchFileDefinitions.find((definition) => definition.extensions.includes(extension));
  if (byExtension) return byExtension;
  if (mimeType.toLowerCase().startsWith('text/')) return researchFileDefinitions.find((definition) => definition.kind === 'text');
  return undefined;
}
