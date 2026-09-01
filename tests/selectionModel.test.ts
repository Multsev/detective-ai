import { describe, expect, it } from 'vitest';
import { SelectionModel } from '../src/client/ui/selection';

describe('Detective UI selection', () => {
  it('supports additive and range selection used by the board', () => {
    const model = new SelectionModel<string>();
    const keys = ['a', 'b', 'c', 'd'];

    model.select('a', keys);
    model.select('c', keys, { toggle: true });
    expect([...model.getSnapshot().selected]).toEqual(['a', 'c']);

    model.select('d', keys, { range: true });
    expect([...model.getSnapshot().selected]).toEqual(['c', 'd']);
    expect(model.getSnapshot().active).toBe('d');
  });

  it('drops deleted keys while retaining a valid active item', () => {
    const model = new SelectionModel<string>();
    model.selectAll(['a', 'b']);

    model.reconcile(['b', 'c']);

    expect([...model.getSnapshot().selected]).toEqual(['b']);
    expect(model.getSnapshot().active).toBe('b');
  });
});
