import { afterEach, describe, expect, it, vi } from 'vitest';
import { caseFileName, downloadCaseFile, parseCaseFile, serializeCaseFile } from '../src/client/lib/caseFile';
import { createSeedCase } from '../src/shared/seed';

afterEach(() => vi.unstubAllGlobals());

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

  it('attaches the download link until the browser accepts the file', () => {
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const revokeObjectURL = vi.fn();
    const anchor = { href: '', download: '', hidden: false, click, remove };

    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild } });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:case-file'), revokeObjectURL });
    vi.stubGlobal('window', { setTimeout: vi.fn((callback: () => void) => { callback(); return 1; }) });

    const investigationCase = { ...createSeedCase(), title: 'Дело: Иван / Морозов' };
    downloadCaseFile(investigationCase);

    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor).toMatchObject({ href: 'blob:case-file', download: 'Дело Иван Морозов.detective', hidden: true });
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:case-file');
  });
});
