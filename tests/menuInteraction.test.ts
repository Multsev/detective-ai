import { describe, expect, it } from 'vitest';
import { isOutsideMenu } from '../src/client/ui/menuInteraction';

describe('floating menu interaction', () => {
  const target = {} as Node;
  const boundary = (contains: boolean) => ({ contains: () => contains });

  it('keeps the menu open for commands rendered in the floating layer', () => {
    expect(isOutsideMenu(target, boundary(false), boundary(true))).toBe(false);
  });

  it('dismisses the menu only when the pointer is outside both layers', () => {
    expect(isOutsideMenu(target, boundary(false), boundary(false))).toBe(true);
  });
});
