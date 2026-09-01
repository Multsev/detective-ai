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

describe('tree graph layout', () => {
  it('uses the selected entity as the root and places descendants to the right', () => {
    const arranged = arrangeInvestigationGraph(
      investigationCase([entity('a'), entity('b'), entity('c')], [relation('a', 'b'), relation('b', 'c')]),
      'c',
    );
    const positions = new Map(arranged.entities.map((item) => [item.id, item.position]));

    expect(positions.get('c')?.x).toBeLessThan(positions.get('b')?.x ?? 0);
    expect(positions.get('b')?.x).toBeLessThan(positions.get('a')?.x ?? 0);
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
});
