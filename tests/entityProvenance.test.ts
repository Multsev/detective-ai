import { describe, expect, it } from 'vitest';
import { buildEntityProvenanceIndex, formatTemporalDate, getEntityProvenance, presentSource } from '../src/client/lib/entityProvenance.js';
import { createSeedCase } from '../src/shared/seed.js';

describe('entity provenance', () => {
  it('uses a verifiable source connected through a relation', () => {
    const investigationCase = createSeedCase();
    const entity = investigationCase.entities.find((item) => item.id === 'anna-lebedeva')!;
    const provenance = getEntityProvenance(investigationCase, entity);

    expect(provenance.primary).toMatchObject({ kind: 'web', label: 'example.com', href: 'https://example.com/interview' });
  });

  it('indexes every entity and de-duplicates relation sources in one pass', () => {
    const investigationCase = createSeedCase();
    const index = buildEntityProvenanceIndex(investigationCase);

    expect(index.size).toBe(investigationCase.entities.length);
    expect(index.get('anna-lebedeva')?.sources).toHaveLength(1);
  });

  it('labels a source-free user card as manual', () => {
    const investigationCase = createSeedCase();
    const entity = investigationCase.entities.find((item) => item.id === 'gallery-north')!;
    const withoutRelations = { ...investigationCase, relations: [] };

    expect(getEntityProvenance(withoutRelations, entity).primary).toMatchObject({ kind: 'manual', label: 'Вручную' });
  });

  it('never turns private or file protocols into clickable links', () => {
    expect(presentSource({ id: 'g', title: 'Контакт', url: 'google-contact://people/1', publisher: 'Google', publishedAt: '', accessedAt: '', kind: 'google_contact' }).href).toBeUndefined();
    expect(presentSource({ id: 'f', title: 'report.md', url: 'case-file://hash/report.md', publisher: 'Файл', publishedAt: '', accessedAt: '', kind: 'uploaded_file' }).href).toBeUndefined();
  });

  it('formats precise, partial, and ranged dates without inventing precision', () => {
    expect(formatTemporalDate('2026-08-28')).toBe('28.08.2026');
    expect(formatTemporalDate('2026-08')).toBe('08.2026');
    expect(formatTemporalDate('2026')).toBe('2026');
    expect(formatTemporalDate('2024-01/2024-03')).toBe('01.2024 — 03.2024');
    expect(formatTemporalDate('')).toBeUndefined();
  });
});
