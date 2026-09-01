import { describe, expect, it } from 'vitest';
import { buildGoogleContactFactLines, importGoogleContact } from '../src/client/lib/googleContactImport.js';
import { createSeedCase } from '../src/shared/seed.js';
import type { GoogleContact } from '../src/shared/domain.js';

const contact: GoogleContact = {
  id: 'c123', resourceName: 'people/c123', displayName: 'Иван Петрович Сидоров', givenName: 'Иван', middleName: 'Петрович', familyName: 'Сидоров', nickname: 'Ваня',
  phoneNumbers: [{ value: '+7 900 000-00-00', type: 'mobile' }],
  emailAddresses: [{ value: 'ivan@example.test', type: 'work' }],
  organizations: [{ title: 'Директор', department: 'Развитие', name: 'ООО «Пример»' }],
  biographies: ['Познакомились на конференции.'],
  userDefined: [{ key: 'Комментарий', value: 'Перезвонить в сентябре' }],
  urls: [{ value: 'https://example.test', type: 'profile' }],
};

describe('Google contact import', () => {
  it('creates a person card with structured private-contact facts and provenance', () => {
    const result = importGoogleContact(createSeedCase(), contact);
    const entity = result.investigationCase.entities.find((item) => item.id === result.entityId)!;
    expect(result.created).toBe(true);
    expect(entity).toMatchObject({ type: 'person', title: 'Иван Петрович Сидоров', subtitle: 'Директор · ООО «Пример»' });
    expect(entity.facts.map((fact) => fact.text)).toContain('Отчество: Петрович');
    expect(entity.facts.map((fact) => fact.text)).toContain('Телефон (mobile): +7 900 000-00-00');
    expect(result.investigationCase.sources.at(-1)).toMatchObject({ kind: 'google_contact', publisher: 'Google Contacts' });
  });

  it('does not duplicate a contact already imported into the case', () => {
    const first = importGoogleContact(createSeedCase(), contact);
    const second = importGoogleContact(first.investigationCase, contact);
    expect(second.created).toBe(false);
    expect(second.investigationCase.entities).toHaveLength(first.investigationCase.entities.length);
  });

  it('builds every supported detail line once', () => {
    const lines = buildGoogleContactFactLines(contact);
    expect(lines).toContain('Фамилия: Сидоров');
    expect(lines).toContain('Работа: Директор · Развитие · ООО «Пример»');
    expect(lines).toContain('Комментарий «Комментарий»: Перезвонить в сентябре');
  });
});
