import { describe, expect, it } from 'vitest';
import { shouldAutoFitResearchGraph, type ResearchAutoFitState } from '../src/client/lib/researchAutoFit.js';

const base: ResearchAutoFitState = { entityCount: 3, relationCount: 2, researching: true };

describe('research graph auto-fit', () => {
  it('fits when the graph grows during research and on the final render', () => {
    expect(shouldAutoFitResearchGraph(true, base, { ...base, entityCount: 4 })).toBe(true);
    expect(shouldAutoFitResearchGraph(true, base, { entityCount: 4, relationCount: 3, researching: false })).toBe(true);
  });

  it('does not interfere with manual layout after research or when disabled', () => {
    expect(shouldAutoFitResearchGraph(true, { ...base, researching: false }, { entityCount: 4, relationCount: 3, researching: false })).toBe(false);
    expect(shouldAutoFitResearchGraph(false, base, { ...base, relationCount: 3 })).toBe(false);
    expect(shouldAutoFitResearchGraph(true, base, base)).toBe(false);
  });
});
