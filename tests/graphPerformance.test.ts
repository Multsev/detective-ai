import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { getGraphBounds, isDenseGraph, reconcileFlowNodes, shouldReduceGraphDetail } from '../src/client/lib/graphPerformance.js';

describe('large graph performance policy', () => {
  it('reduces detail only for dense graphs at distant zoom', () => {
    expect(isDenseGraph(30, 0)).toBe(true);
    expect(isDenseGraph(10, 45)).toBe(true);
    expect(shouldReduceGraphDetail(40, 60, 0.3)).toBe(true);
    expect(shouldReduceGraphDetail(40, 60, 0.8)).toBe(false);
    expect(shouldReduceGraphDetail(10, 10, 0.3)).toBe(false);
  });

  it('preserves unchanged node references and measured state', () => {
    const first = { id: 'one', position: { x: 1, y: 2 }, data: { value: 'same' }, measured: { width: 205, height: 145 } } satisfies Node;
    const second = { id: 'two', position: { x: 3, y: 4 }, data: { value: 'before' }, measured: { width: 205, height: 145 } } satisfies Node;
    const result = reconcileFlowNodes([first, second], [
      { id: 'one', position: { x: 1, y: 2 }, data: { value: 'same' } },
      { id: 'two', position: { x: 3, y: 4 }, data: { value: 'after' } },
    ]);

    expect(result[0]).toBe(first);
    expect(result[1]).not.toBe(second);
    expect(result[1].measured).toEqual({ width: 205, height: 145 });
  });

  it('calculates full bounds even when nodes are virtualized out of the DOM', () => {
    const bounds = getGraphBounds([
      { id: 'one', position: { x: -100, y: 20 }, data: {}, measured: { width: 200, height: 100 } },
      { id: 'two', position: { x: 900, y: 520 }, data: {}, measured: { width: 200, height: 100 } },
    ]);

    expect(bounds).toEqual({ x: -100, y: 20, width: 1200, height: 600 });
  });
});
