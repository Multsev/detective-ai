import { describe, expect, it } from 'vitest';
import { caseFileName, parseCaseFile, serializeCaseFile } from '../src/client/lib/caseFile';
import { createSeedCase } from '../src/shared/seed';

describe('detective case files', () => {
  it('round-trips a case through the versioned envelope', () => {
    const investigationCase = createSeedCase();
    const restored = parseCaseFile(serializeCaseFile(investigationCase));

    expect(restored.id).toBe(investigationCase.id);
    expect(restored.entities).toEqual(investigationCase.entities);
    expect(restored.relations).toEqual(investigationCase.relations);
  });

  it('accepts legacy plain JSON and creates a filesystem-safe name', () => {
    const investigationCase = { ...createSeedCase(), title: 'Дело: Иван / Морозов' };

    expect(parseCaseFile(JSON.stringify(investigationCase)).title).toBe(investigationCase.title);
    expect(caseFileName(investigationCase)).toBe('Дело Иван Морозов.detective');
  });
});
