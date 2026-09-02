import { describe, expect, it } from 'vitest';
import { loadInspectorSectionPreferences, parseInspectorSectionPreferences, updateInspectorSectionPreferences } from '../src/client/lib/inspectorSectionState.js';

describe('inspector section state', () => {
  it('defaults every card to collapsed when no preference exists', () => {
    expect(parseInspectorSectionPreferences(null)).toEqual({});
    expect(parseInspectorSectionPreferences('{broken')).toEqual({});
  });

  it('stays collapsed when browser storage is unavailable', () => {
    expect(loadInspectorSectionPreferences({ getItem: () => { throw new Error('blocked'); } })).toEqual({});
  });

  it('keeps only valid unique section identifiers', () => {
    expect(parseInspectorSectionPreferences(JSON.stringify({ 'entity:one': ['sources', 'sources', 42], invalid: true }))).toEqual({
      'entity:one': ['sources'],
    });
  });

  it('remembers open sections independently for each card and relation', () => {
    const first = updateInspectorSectionPreferences({}, 'entity:one', ['overview', 'sources']);
    const second = updateInspectorSectionPreferences(first, 'relation:two', ['assessment']);
    expect(second).toEqual({ 'entity:one': ['overview', 'sources'], 'relation:two': ['assessment'] });
    expect(updateInspectorSectionPreferences(second, 'entity:one', [])).toEqual({ 'relation:two': ['assessment'] });
  });
});
