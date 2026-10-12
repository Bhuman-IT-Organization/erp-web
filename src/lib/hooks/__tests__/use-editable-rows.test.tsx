// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_EDITABLE_ROWS,
  dirtyCount,
  editableRowsReducer,
  errorsFromIssues,
  staleIdsFromIssues,
  toBatch,
  useEditableRows,
  type EditableRowsAction,
  type EditableRowsState,
} from '../use-editable-rows';

/**
 * K6: the editable table's whole state is this pure reducer (ADR-0040, L-08). The component only
 * renders it, so every rule of the batch (versions, order, what counts as changed) is proven here.
 */
const run = (...actions: EditableRowsAction[]): EditableRowsState =>
  actions.reduce(editableRowsReducer, EMPTY_EDITABLE_ROWS);

const UNIT_1 = { name: 'Unit 1', display: true, tags: ['a', 'b'] };
const UNIT_2 = { name: 'Unit 2', display: false, tags: [] };
const edit1: EditableRowsAction = { type: 'edit', id: '1', etag: 'e1', original: UNIT_1 };
const edit2: EditableRowsAction = { type: 'edit', id: '2', etag: 'e2', original: UNIT_2 };

describe('editableRowsReducer', () => {
  it('add twice gives new-1 and new-2, newest first; removeNew drops one; dirtyCount counts the added rows', () => {
    const two = run({ type: 'add', draft: { name: '' } }, { type: 'add', draft: { name: '' } });
    expect(two.added.map((row) => row.key)).toEqual(['new-2', 'new-1']);
    expect(dirtyCount(two)).toBe(2);
    const one = editableRowsReducer(two, { type: 'removeNew', key: 'new-2' });
    expect(one.added.map((row) => row.key)).toEqual(['new-1']);
    expect(dirtyCount(one)).toBe(1);
    // A removed key is never handed out twice while its sibling lives.
    const again = editableRowsReducer(
      editableRowsReducer(two, { type: 'removeNew', key: 'new-1' }),
      { type: 'add', draft: { name: '' } },
    );
    expect(again.added.map((row) => row.key)).toEqual(['new-3', 'new-2']);
  });

  it('change on an added row updates its draft', () => {
    const state = run(
      { type: 'add', draft: { name: '' } },
      { type: 'change', key: 'new-1', field: 'name', value: 'Box' },
    );
    expect(state.added[0]?.draft).toEqual({ name: 'Box' });
  });

  it('edit then change makes the row dirty; changing it back makes it clean; undo restores and clears its errors', () => {
    const dirty = run(edit1, { type: 'change', key: '1', field: 'name', value: 'Unit 1b' });
    expect(dirtyCount(dirty)).toBe(1);
    expect(dirty.edited.get('1')?.draft.name).toBe('Unit 1b');
    const back = editableRowsReducer(dirty, {
      type: 'change',
      key: '1',
      field: 'name',
      value: 'Unit 1',
    });
    expect(dirtyCount(back)).toBe(0);
    // An array value in another order is the same value.
    const reordered = editableRowsReducer(back, {
      type: 'change',
      key: '1',
      field: 'tags',
      value: ['b', 'a'],
    });
    expect(dirtyCount(reordered)).toBe(0);
    const withErrors = editableRowsReducer(dirty, {
      type: 'setErrors',
      errors: new Map([['1', { name: 'Enter a name.' }]]),
    });
    const undone = editableRowsReducer(withErrors, { type: 'undo', key: '1' });
    expect(undone.edited.has('1')).toBe(false);
    expect(undone.errors.has('1')).toBe(false);
    expect(dirtyCount(undone)).toBe(0);
  });

  it('change clears that cell error only', () => {
    const state = run(edit1, {
      type: 'setErrors',
      errors: new Map([['1', { name: 'Enter a name.', display: 'Bad.' }]]),
    });
    const changed = editableRowsReducer(state, {
      type: 'change',
      key: '1',
      field: 'name',
      value: 'X',
    });
    expect(changed.errors.get('1')).toEqual({ display: 'Bad.' });
  });

  it('applyToRows edits rows not yet in edit from originals and patches only the named field; an empty field is unchanged', () => {
    const levels = (min: string, max: string) => ({ minimum: min, maximum: max });
    const originals = new Map([
      ['1', { etag: 'e1', original: levels('1', '9') }],
      ['2', { etag: 'e2', original: levels('2', '8') }],
    ]);
    const state = run(
      { type: 'edit', id: '2', etag: 'e2', original: levels('2', '8') },
      { type: 'change', key: '2', field: 'maximum', value: '7' },
      { type: 'applyToRows', ids: ['1', '2'], patch: { minimum: '5', maximum: '' }, originals },
    );
    expect(state.edited.get('1')).toEqual({
      etag: 'e1',
      original: levels('1', '9'),
      draft: levels('5', '9'),
    });
    expect(state.edited.get('2')?.draft).toEqual(levels('5', '7'));
    expect(dirtyCount(state)).toBe(2);
  });

  it('markStale keeps only ids of edited rows; reset clears everything', () => {
    const stale = run(edit1, { type: 'markStale', ids: ['1', '99'] });
    expect([...stale.stale]).toEqual(['1']);
    expect(editableRowsReducer(stale, { type: 'reset' })).toEqual(EMPTY_EDITABLE_ROWS);
  });
});

describe('toBatch', () => {
  it('added rows oldest first without id or etag, then changed rows with a numeric id and their etag; unchanged edited rows are left out', () => {
    const state = run(
      { type: 'add', draft: { name: 'First' } },
      { type: 'add', draft: { name: 'Second' } },
      edit1,
      edit2,
      { type: 'change', key: '2', field: 'display', value: true },
    );
    const batch = toBatch(state);
    expect(batch.rows).toEqual([
      { name: 'First' },
      { name: 'Second' },
      { ...UNIT_2, display: true, id: 2, etag: 'e2' },
    ]);
    expect(batch.keys).toEqual(['new-1', 'new-2', '2']);
  });
});

describe('issue mapping (untrusted issues)', () => {
  const text = (field: string) => `bad ${field}`;

  it('maps an issue on [rows, i, field] to errors[keys[i]][field] and ignores any other path', () => {
    const errors = errorsFromIssues(
      [
        { path: ['rows', 1, 'name'], message: 'x' },
        { path: ['rows', 0, 'code'] },
        { path: ['name'] },
        { path: ['rows', 7, 'name'] },
        { path: ['rows', '1', 'name'] },
        'junk',
      ],
      ['new-1', '4'],
      text,
    );
    expect(Object.fromEntries(errors)).toEqual({
      '4': { name: 'bad name' },
      'new-1': { code: 'bad code' },
    });
    expect(errorsFromIssues({ not: 'an array' }, ['1'], text).size).toBe(0);
  });

  it('staleIdsFromIssues reads [{ id }] as strings; a malformed value is []', () => {
    expect(staleIdsFromIssues([{ id: '7' }, { id: 9 }])).toEqual(['7', '9']);
    expect(staleIdsFromIssues([{ id: '7' }, { nope: 1 }, null])).toEqual(['7']);
    expect(staleIdsFromIssues('stale')).toEqual([]);
    expect(staleIdsFromIssues(undefined)).toEqual([]);
  });
});

describe('useEditableRows', () => {
  it('holds the state in a reducer and derives the dirty count', () => {
    const { result } = renderHook(() => useEditableRows());
    expect(result.current.dirty).toBe(0);
    act(() => {
      result.current.dispatch({ type: 'add', draft: { name: '' } });
    });
    expect(result.current.dirty).toBe(1);
    expect(result.current.state.added[0]?.key).toBe('new-1');
  });
});
