import type { EvidenceStatus } from './domain.js';

export interface EvidenceVisualStyle {
  color: string;
  dash?: string;
  width: number;
  label: string;
}

export const evidenceStyles: Record<EvidenceStatus, EvidenceVisualStyle> = {
  official: { color: '#2f7eb2', width: 3.2, label: 'Официально подтверждено' },
  corroborated: { color: '#2f7eb2', width: 2.4, label: 'Подтверждено источниками' },
  probable: { color: '#c1862f', dash: '10 7', width: 2.4, label: 'Вероятно' },
  hypothesis: { color: '#c1862f', dash: '4 7', width: 1.8, label: 'Гипотеза' },
  user_asserted: { color: '#7357a5', width: 2.4, label: 'Добавлено пользователем' },
  contradicted: { color: '#b63d46', dash: '2 5', width: 3.4, label: 'Есть противоречия' },
  unknown: { color: '#7b838c', dash: '2 8', width: 1.8, label: 'Неизвестно' },
};
