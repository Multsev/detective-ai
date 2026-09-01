import type { EntityAttribute, EntityAttributeKind, EntityType } from './domain.js';

export interface EntityAttributeDefinition {
  key: string;
  label: string;
  kind: EntityAttributeKind;
}

export const entityAttributeCatalog: Record<EntityType, EntityAttributeDefinition[]> = {
  person: [
    { key: 'phone', label: 'Телефон', kind: 'phone' },
    { key: 'email', label: 'Email', kind: 'email' },
    { key: 'social', label: 'Социальная сеть', kind: 'social' },
    { key: 'position', label: 'Должность', kind: 'text' },
    { key: 'organization', label: 'Организация', kind: 'text' },
    { key: 'website', label: 'Сайт / профиль', kind: 'website' },
    { key: 'birth_date', label: 'Дата рождения', kind: 'date' },
    { key: 'other', label: 'Другое', kind: 'text' },
  ],
  company: [
    { key: 'inn', label: 'ИНН', kind: 'tax_id' },
    { key: 'ogrn', label: 'ОГРН', kind: 'registration_id' },
    { key: 'kpp', label: 'КПП', kind: 'tax_id' },
    { key: 'legal_address', label: 'Юридический адрес', kind: 'address' },
    { key: 'website', label: 'Официальный сайт', kind: 'website' },
    { key: 'email', label: 'Email', kind: 'email' },
    { key: 'phone', label: 'Телефон', kind: 'phone' },
    { key: 'employee_count', label: 'Численность сотрудников', kind: 'employee_count' },
    { key: 'bank_name', label: 'Банк', kind: 'bank_name' },
    { key: 'bank_bic', label: 'БИК', kind: 'bank_bic' },
    { key: 'bank_account', label: 'Расчётный счёт', kind: 'bank_account' },
    { key: 'correspondent_account', label: 'Корреспондентский счёт', kind: 'correspondent_account' },
    { key: 'other', label: 'Другое', kind: 'text' },
  ],
  document: [
    { key: 'document_number', label: 'Номер документа', kind: 'identifier' },
    { key: 'issuer', label: 'Кем выдан', kind: 'text' },
    { key: 'issue_date', label: 'Дата выдачи', kind: 'date' },
    { key: 'valid_until', label: 'Действует до', kind: 'date' },
    { key: 'website', label: 'Ссылка', kind: 'website' },
    { key: 'other', label: 'Другое', kind: 'text' },
  ],
  event: [
    { key: 'start_date', label: 'Дата начала', kind: 'date' },
    { key: 'end_date', label: 'Дата окончания', kind: 'date' },
    { key: 'location', label: 'Место', kind: 'address' },
    { key: 'organizer', label: 'Организатор', kind: 'text' },
    { key: 'website', label: 'Ссылка', kind: 'website' },
    { key: 'other', label: 'Другое', kind: 'text' },
  ],
  location: [
    { key: 'address', label: 'Адрес', kind: 'address' },
    { key: 'coordinates', label: 'Координаты', kind: 'identifier' },
    { key: 'registry_id', label: 'Реестровый номер', kind: 'identifier' },
    { key: 'website', label: 'Ссылка', kind: 'website' },
    { key: 'other', label: 'Другое', kind: 'text' },
  ],
  question: [
    { key: 'status', label: 'Статус', kind: 'text' },
    { key: 'deadline', label: 'Срок', kind: 'date' },
    { key: 'owner', label: 'Ответственный', kind: 'text' },
    { key: 'other', label: 'Другое', kind: 'text' },
  ],
  note: [
    { key: 'author', label: 'Автор', kind: 'text' },
    { key: 'created_at', label: 'Дата', kind: 'date' },
    { key: 'category', label: 'Категория', kind: 'text' },
    { key: 'other', label: 'Другое', kind: 'text' },
  ],
};

export function getEntityAttributeDefinitions(type: EntityType): EntityAttributeDefinition[] {
  return entityAttributeCatalog[type];
}

export function getAttributeHref(attribute: Pick<EntityAttribute, 'kind' | 'value'>): string | undefined {
  if (attribute.kind === 'phone') return `tel:${attribute.value.replace(/[^+\d]/g, '')}`;
  if (attribute.kind === 'email') return `mailto:${attribute.value}`;
  if (attribute.kind === 'website' || attribute.kind === 'social') {
    try {
      const url = new URL(attribute.value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function normalizeAttributeValue(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ').trim();
}

export function attributeIdentityKey(attribute: Pick<EntityAttribute, 'key' | 'value'>): string {
  return `${attribute.key.trim().toLowerCase()}:${normalizeAttributeValue(attribute.value)}`;
}
