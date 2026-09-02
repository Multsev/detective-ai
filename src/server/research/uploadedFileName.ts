const multipartMojibakeMarker = /[ÐÑ]/;
const cyrillicCharacter = /[\u0400-\u04ff]/;

function markerCount(value: string): number {
  return value.match(/[ÐÑ]/g)?.length ?? 0;
}

/** Repairs UTF-8 file names that multipart parsers expose as ISO-8859-1 text. */
export function normalizeUploadedFileName(fileName: string): string {
  if (!multipartMojibakeMarker.test(fileName)) return fileName;
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(fileName, 'latin1'));
    return cyrillicCharacter.test(decoded) && markerCount(decoded) < markerCount(fileName) ? decoded : fileName;
  } catch {
    return fileName;
  }
}
