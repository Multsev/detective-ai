import { describe, expect, it } from 'vitest';
import { getEntityProvenance, presentSource } from '../src/client/lib/entityProvenance.js';
import { createSeedCase } from '../src/shared/seed.js';

describe('entity provenance', () => {
  it('uses a verifiable source connected through a relation', () => {
    const investigationCase = createSeedCase();
    const entity = investigationCase.entities.find((item) => item.id === 'anna-lebedeva')!;
    const provenance = getEntityProvenance(investigationCase, entity);

    expect(provenance.primary).toMatchObject({ kind: 'web', label: 'example.com', href: 'https://example.com/interview' });
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
});
