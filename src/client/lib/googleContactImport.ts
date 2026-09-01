import type { CaseFact, GoogleContact, InvestigationCase, InvestigationEntity, SourceReference } from '../../shared/domain';

export interface GoogleContactImportResult {
  investigationCase: InvestigationCase;
  entityId: string;
  created: boolean;
}

const normalizeId = (value: string) => value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'contact';

export function importGoogleContact(investigationCase: InvestigationCase, contact: GoogleContact): GoogleContactImportResult {
  const stableId = normalizeId(contact.id);
  const sourceId = `google-contact-${stableId}`;
  const existing = investigationCase.entities.find((entity) => entity.facts.some((fact) => fact.sourceIds.includes(sourceId)));
  if (existing) return { investigationCase, entityId: existing.id, created: false };

  const detailLines = buildGoogleContactFactLines(contact);
  const facts: CaseFact[] = detailLines.map((text, index) => ({
    id: `fact-${sourceId}-${index + 1}`,
    kind: text.startsWith('Комментарий:') || text.startsWith('Заметка:') ? 'note' : 'claim',
    text,
    status: 'user_asserted',
    confidence: 0.6,
    sourceIds: [sourceId],
    createdBy: 'user',
  }));
  const organization = contact.organizations[0];
  const subtitle = [organization?.title, organization?.name].filter(Boolean).join(' · ') || contact.phoneNumbers[0]?.value || 'Контакт Google';
  const entityIdBase = `person-google-${stableId}`;
  let entityId = entityIdBase;
  let duplicateIndex = 2;
  const existingIds = new Set(investigationCase.entities.map((entity) => entity.id));
  while (existingIds.has(entityId)) entityId = `${entityIdBase}-${duplicateIndex++}`;

  const entity: InvestigationEntity = {
    id: entityId,
    type: 'person',
    title: contact.displayName,
    subtitle,
    summary: contact.biographies[0] || 'Карточка импортирована из личных Google Контактов. Эти сведения не считаются подтверждёнными открытыми источниками.',
    position: {
      x: 260 + (investigationCase.entities.length % 4) * 250,
      y: 180 + (Math.floor(investigationCase.entities.length / 4) % 4) * 210,
    },
    facts,
    sourceIds: [sourceId],
    createdBy: 'user',
  };
  const source: SourceReference = {
    id: sourceId,
    title: `Google Контакт: ${contact.displayName}`,
    url: `google-contact://${encodeURIComponent(contact.resourceName)}`,
    publisher: 'Google Contacts',
    publishedAt: '',
    accessedAt: new Date().toISOString().slice(0, 10),
    kind: 'google_contact',
  };

  return {
    investigationCase: {
      ...investigationCase,
      entities: [...investigationCase.entities, entity],
      sources: [...investigationCase.sources, source],
    },
    entityId,
    created: true,
  };
}

export function buildGoogleContactFactLines(contact: GoogleContact): string[] {
  const lines = [
    contact.familyName && `Фамилия: ${contact.familyName}`,
    contact.givenName && `Имя: ${contact.givenName}`,
    contact.middleName && `Отчество: ${contact.middleName}`,
    contact.nickname && `Псевдоним: ${contact.nickname}`,
    ...contact.phoneNumbers.map((phone) => `Телефон${phone.type ? ` (${phone.type})` : ''}: ${phone.value}`),
    ...contact.emailAddresses.map((email) => `Email${email.type ? ` (${email.type})` : ''}: ${email.value}`),
    ...contact.organizations.map((organization) => `Работа: ${[organization.title, organization.department, organization.name].filter(Boolean).join(' · ')}`),
    ...contact.biographies.map((biography) => `Заметка: ${biography}`),
    ...contact.userDefined.map((field) => `Комментарий${field.key ? ` «${field.key}»` : ''}: ${field.value}`),
    ...contact.urls.map((url) => `Ссылка${url.type ? ` (${url.type})` : ''}: ${url.value}`),
  ].filter((line): line is string => Boolean(line));
  return [...new Set(lines)];
}
