import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('unified detective palette', () => {
  it('loads after the legacy component styles', async () => {
    const entry = await readFile(new URL('../src/client/main.tsx', import.meta.url), 'utf8');
    expect(entry.indexOf("import './palette.css'"))
      .toBeGreaterThan(entry.indexOf("import './styles.css'"));
  });

  it('defines separate surface, accent, and semantic color roles', async () => {
    const palette = await readFile(new URL('../src/client/palette.css', import.meta.url), 'utf8');
    for (const token of [
      '--case-graphite-950',
      '--case-paper-100',
      '--case-paper-ink',
      '--case-amber-500',
      '--case-success',
      '--case-warning',
      '--case-danger',
      '--case-info',
    ]) {
      expect(palette).toContain(token);
    }
  });
});
