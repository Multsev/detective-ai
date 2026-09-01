import { describe, expect, it } from 'vitest';
import { isMotionLevel, motionDuration } from '../src/client/motion/motionPreferences';

describe('motion preferences', () => {
  it('scales spatial motion down and can disable it', () => {
    expect(motionDuration('full', 520)).toBe(520);
    expect(motionDuration('reduced', 520)).toBe(120);
    expect(motionDuration('off', 520)).toBe(0);
  });

  it('accepts only supported persisted values', () => {
    expect(isMotionLevel('full')).toBe(true);
    expect(isMotionLevel('reduced')).toBe(true);
    expect(isMotionLevel('off')).toBe(true);
    expect(isMotionLevel('cinematic')).toBe(false);
  });
});
