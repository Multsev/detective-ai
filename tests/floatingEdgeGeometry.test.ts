import { describe, expect, it } from 'vitest';
import { buildParallelEdgeOffsets, getFloatingConnection, getSelfLoopPath } from '../src/client/lib/floatingEdgeGeometry.js';

const card = { x: 100, y: 100, width: 200, height: 140 };

describe('floating edge geometry', () => {
  it('uses the nearest horizontal sides when the target is beside the source', () => {
    const connection = getFloatingConnection(card, { x: 500, y: 120, width: 200, height: 140 });
    expect(connection.source.side).toBe('right');
    expect(connection.target.side).toBe('left');
    expect(connection.source.x).toBe(300);
    expect(connection.target.x).toBe(500);
  });

  it('switches to vertical sides when a card moves above the source', () => {
    const connection = getFloatingConnection(card, { x: 120, y: -180, width: 200, height: 140 });
    expect(connection.source.side).toBe('top');
    expect(connection.target.side).toBe('bottom');
    expect(connection.source.y).toBe(100);
  });

  it('spreads parallel relations symmetrically', () => {
    const offsets = buildParallelEdgeOffsets([
      { id: 'one', sourceId: 'a', targetId: 'b' },
      { id: 'two', sourceId: 'b', targetId: 'a' },
      { id: 'three', sourceId: 'a', targetId: 'b' },
    ], 10);
    expect([...offsets.values()]).toEqual([-10, 0, 10]);
  });

  it('builds a visible loop outside a self-linked card', () => {
    const loop = getSelfLoopPath(card);
    expect(loop.path).toContain('C 354');
    expect(loop.labelX).toBeGreaterThan(card.x + card.width);
    expect(loop.labelY).toBe(card.y + card.height / 2);
  });
});
