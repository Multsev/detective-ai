import { describe, expect, it } from 'vitest';
import { evidenceStyles } from '../src/shared/evidenceStyle.js';

describe('evidence visual language', () => {
  it('never presents a hypothesis as a solid confirmed relation', () => {
    expect(evidenceStyles.hypothesis.dash).toBeTruthy();
    expect(evidenceStyles.hypothesis.color).not.toBe(evidenceStyles.official.color);
  });

  it('keeps user assertions visually distinct from sourced claims', () => {
    expect(evidenceStyles.user_asserted.color).not.toBe(evidenceStyles.official.color);
    expect(evidenceStyles.user_asserted.label).toContain('пользователем');
  });
});
