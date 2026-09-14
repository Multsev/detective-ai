import { describe, expect, it } from 'vitest';
import { validateResearchEvidence } from '../src/server/research/researchEvidenceValidator.js';
import { createSeedCase } from '../src/shared/seed.js';
import type { ResearchResult } from '../src/shared/domain.js';

function result(overrides: Partial<ResearchResult> = {}): ResearchResult {
  return { summary: '', identityAssessment: '', candidateEntities: [], entityUpdates: [], claims: [], questions: [], sources: [], warnings: [], questionResolution: null, ...overrides };
}

describe('research evidence validation', () => {
  it('accepts a phone or company identifier supported by an uploaded file source', () => {
    const investigationCase = createSeedCase();
    const fileSource = { id: 'file-1', title: 'report.pdf', url: 'case-file://hash/report.pdf', publisher: 'Загруженный файл', publishedAt: '', accessedAt: '2026-09-02', kind: 'uploaded_file' as const };
    expect(() => validateResearchEvidence(result({ entityUpdates: [{ entityId: investigationCase.entities[0].id, attributes: [
      { key: 'phone', label: 'Телефон', value: '+7 900 000-00-00', kind: 'phone', sourceIds: ['file-1'], confidence: 0.9 },
      { key: 'inn', label: 'ИНН', value: '1234567890', kind: 'tax_id', sourceIds: ['file-1'], confidence: 0.9 },
    ] }] }), investigationCase, [fileSource])).not.toThrow();
  });

  it('rejects confirmed claims and attributes without valid provenance', () => {
    const investigationCase = createSeedCase();
    expect(() => validateResearchEvidence(result({
      entityUpdates: [{ entityId: investigationCase.entities[0].id, attributes: [{ key: 'phone', label: 'Телефон', value: '+7 900 000-00-00', kind: 'phone', sourceIds: ['missing'], confidence: 0.9 }] }],
      claims: [{ id: 'claim-1', subjectId: investigationCase.entities[0].id, predicate: 'руководит', objectId: investigationCase.entities[1].id, status: 'official', confidence: 1, explanation: '', sourceIds: [], occurredAt: '' }],
    }), investigationCase)).toThrow('непроверяемый граф');
  });
});
