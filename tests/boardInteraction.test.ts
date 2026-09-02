import { describe, expect, it } from 'vitest';
import { registerBackgroundClick } from '../src/client/lib/boardInteraction';

describe('board background interaction', () => {
  it('opens the add dialog after two nearby clicks', () => {
    const first = registerBackgroundClick(0, 1000);
    const second = registerBackgroundClick(first.nextClickAt, 1200);

    expect(first.openAddEntity).toBe(false);
    expect(second).toEqual({ openAddEntity: true, nextClickAt: 0 });
  });

  it('starts a new click sequence after the threshold', () => {
    expect(registerBackgroundClick(1000, 1400)).toEqual({ openAddEntity: false, nextClickAt: 1400 });
  });
});
