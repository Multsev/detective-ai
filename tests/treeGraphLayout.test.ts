import { describe, expect, it } from 'vitest';
import type { InvestigationCase, InvestigationEntity, InvestigationRelation } from '../src/shared/domain.js';
import { arrangeInvestigationGraph } from '../src/client/lib/treeGraphLayout.js';

function entity(id: string, title = id): InvestigationEntity {
  return { id, type: 'person', title, subtitle: '', summary: '', position: { x: 999, y: 999 }, facts: [] };
}

function relation(sourceId: string, targetId: string): InvestigationRelation {
  return { id: `${sourceId}-${targetId}`, sourceId, targetId, label: 'связь', explanation: '', status: 'unknown', confidence: 0, sourceIds: [], createdBy: 'user' };
}

function investigationCase(entities: InvestigationEntity[], relations: InvestigationRelation[]): InvestigationCase {
  return { id: 'case', caseNumber: 1, subject: 'Тест', title: 'Дело', subtitle: '', entities, relations, sources: [], updatedAt: '' };
}

describe('context-aware graph layout', () => {
  it('places graph-distance levels on concentric rings around the selected entity', () => {
    const arranged = arrangeInvestigationGraph(
      investigationCase([entity('a'), entity('b'), entity('c')], [relation('a', 'b'), relation('b', 'c')]),
      'c',
    );
    const positions = new Map(arranged.entities.map((item) => [item.id, item.position]));

    const center = positions.get('c')!;
    const firstRingDistance = distance(center, positions.get('b')!);
    const secondRingDistance = distance(center, positions.get('a')!);
    expect(firstRingDistance).toBeCloseTo(300, 4);
    expect(secondRingDistance).toBeCloseTo(600, 4);
  });

  it('spreads direct neighbors evenly around the selected card like rays', () => {
    const arranged = arrangeInvestigationGraph(
      investigationCase(
        [entity('center'), entity('north'), entity('east'), entity('south'), entity('west')],
        [relation('center', 'north'), relation('center', 'east'), relation('center', 'south'), relation('center', 'west')],
      ),
      'center',
    );
    const positions = new Map(arranged.entities.map((item) => [item.id, item.position]));
    const center = positions.get('center')!;
    const neighborOffsets = ['north', 'east', 'south', 'west'].map((id) => {
      const position = positions.get(id)!;
      return { x: Math.round(position.x - center.x), y: Math.round(position.y - center.y) };
    });

    expect(neighborOffsets).toEqual(expect.arrayContaining([
      { x: 0, y: -300 }, { x: 300, y: 0 }, { x: 0, y: 300 }, { x: -300, y: 0 },
    ]));
  });

  it('keeps outer graph-distance rings beyond a crowded inner ring', () => {
    const directNeighbors = Array.from({ length: 24 }, (_, index) => `neighbor-${index}`);
    const arranged = arrangeInvestigationGraph(
      investigationCase(
        [entity('center'), ...directNeighbors.map((id) => entity(id)), entity('outer')],
        [...directNeighbors.map((id) => relation('center', id)), relation(directNeighbors[0], 'outer')],
      ),
      'center',
    );
    const positions = new Map(arranged.entities.map((item) => [item.id, item.position]));
    const center = positions.get('center')!;
    const innerRadius = distance(center, positions.get(directNeighbors[0])!);
    const outerRadius = distance(center, positions.get('outer')!);

    expect(outerRadius).toBeGreaterThanOrEqual(innerRadius + 300 - 0.001);
  });

  it('lays out cycles once while preserving every relation', () => {
    const original = investigationCase(
      [entity('a'), entity('b'), entity('c')],
      [relation('a', 'b'), relation('b', 'c'), relation('c', 'a')],
    );
    const arranged = arrangeInvestigationGraph(original, 'a');
    const coordinateKeys = arranged.entities.map((item) => `${item.position.x}:${item.position.y}`);

    expect(new Set(coordinateKeys).size).toBe(3);
    expect(arranged.relations).toEqual(original.relations);
  });

  it('separates disconnected components and preserves entity details', () => {
    const original = investigationCase(
      [{ ...entity('a'), summary: 'Не менять', facts: [{ id: 'f', kind: 'note', text: 'Факт', status: 'user_asserted', confidence: 0.5, sourceIds: [], createdBy: 'user' }] }, entity('b'), entity('c')],
      [relation('a', 'b')],
    );
    const arranged = arrangeInvestigationGraph(original);
    const positions = arranged.entities.map((item) => `${item.position.x}:${item.position.y}`);

    expect(new Set(positions).size).toBe(3);
    expect(arranged.entities.find((item) => item.id === 'a')?.summary).toBe('Не менять');
    expect(arranged.entities.find((item) => item.id === 'a')?.facts).toEqual(original.entities[0].facts);
  });

  it('keeps disconnected components outside the selected radial component', () => {
    const arranged = arrangeInvestigationGraph(
      investigationCase([entity('center'), entity('linked'), entity('detached-a'), entity('detached-b')], [relation('center', 'linked'), relation('detached-a', 'detached-b')]),
      'center',
    );
    const positions = new Map(arranged.entities.map((item) => [item.id, item.position]));
    const radialRight = Math.max(positions.get('center')!.x, positions.get('linked')!.x) + 205;

    expect(positions.get('detached-a')!.x).toBeGreaterThan(radialRight);
    expect(positions.get('detached-b')!.x).toBeGreaterThan(radialRight);
  });
});

function distance(first: InvestigationEntity['position'], second: InvestigationEntity['position']): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
