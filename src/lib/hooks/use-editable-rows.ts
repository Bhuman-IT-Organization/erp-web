import { useReducer } from 'react';
import { z } from 'zod';

/**
 * K6: the whole state of the editable table (`ListPageTemplate`'s editable mode), a pure reducer the
 * component only renders. The save is the batch wire of ADR-0040 (plan 03):
 *
 * ```text
 * PUT <list>/batch  { rows: [{ id?, etag?, ...fields }] }   id and etag on a changed row, neither on a new one
 * 400 ERP-VALIDATION-0001  issues[].path = ['rows', <index in rows>, <field>]
 * 412 ERP-CORE-0013        issues = [{ id }]   nothing written (L-08: one stale row refuses the batch)
 * ```
 *
 * Every changed row carries the `etag` it was read with, so the api refuses a row someone else
 * changed (T-4.2-42). `issues` is untrusted: it is parsed, and only paths inside the sent batch and
 * ids of rows being edited are kept (T-4.2-45).
 */

/** One cell: text (numbers stay text until the api parses them), a yes/no, or a multi choice. */
export type DraftValue = string | boolean | readonly string[];
/** A row as the inputs hold it, field by field. */
export type Draft = Readonly<Record<string, DraftValue>>;
/** A row being edited: the etag and values it was read with, and the values typed since. */
export interface EditedRow {
  readonly etag: string;
  readonly original: Draft;
  readonly draft: Draft;
}
/** Everything the editable table holds between two saves. */
export interface EditableRowsState {
  /** Key `new-<n>`, newest first. */
  readonly added: readonly { readonly key: string; readonly draft: Draft }[];
  /** By row id, in the order the rows were first edited. */
  readonly edited: ReadonlyMap<string, EditedRow>;
  /** Row key or id, then field, then the translated message. */
  readonly errors: ReadonlyMap<string, Readonly<Record<string, string>>>;
  /** Row ids the api called stale. */
  readonly stale: ReadonlySet<string>;
}
/** What the table does to its state; the reducer below is the only writer. */
export type EditableRowsAction =
  | { readonly type: 'add'; readonly draft: Draft }
  | { readonly type: 'removeNew'; readonly key: string }
  | { readonly type: 'edit'; readonly id: string; readonly etag: string; readonly original: Draft }
  | {
      readonly type: 'change';
      readonly key: string;
      readonly field: string;
      readonly value: DraftValue;
    }
  | { readonly type: 'undo'; readonly key: string }
  | {
      readonly type: 'applyToRows';
      readonly ids: readonly string[];
      readonly patch: Draft;
      readonly originals: ReadonlyMap<string, { readonly etag: string; readonly original: Draft }>;
    }
  | { readonly type: 'setErrors'; readonly errors: EditableRowsState['errors'] }
  | { readonly type: 'markStale'; readonly ids: readonly string[] }
  | { readonly type: 'reset' };

/** Nothing added, edited, refused or stale: the state after a save or a discard. */
export const EMPTY_EDITABLE_ROWS: EditableRowsState = {
  added: [],
  edited: new Map(),
  errors: new Map(),
  stale: new Set(),
};

const NEW_PREFIX = 'new-';

/** One cell's value compared: a multi choice is the same in any order. */
export function sameDraftValue(a: DraftValue | undefined, b: DraftValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item) => b.includes(item));
  }
  return a === b;
}

const sameDraft = (a: Draft, b: Draft): boolean =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].every((field) =>
    sameDraftValue(a[field], b[field]),
  );

const isChanged = (row: EditedRow): boolean => !sameDraft(row.original, row.draft);

/** The next `new-<n>`: one past the highest held, so a removed key is not reused beside a living one. */
function nextKey(added: EditableRowsState['added']): string {
  const highest = Math.max(0, ...added.map((row) => Number(row.key.slice(NEW_PREFIX.length))));
  return `${NEW_PREFIX}${String(highest + 1)}`;
}

function withoutKey<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

/** A change clears that cell's error and no other. */
function clearCellError(
  errors: EditableRowsState['errors'],
  key: string,
  field: string,
): EditableRowsState['errors'] {
  const row = errors.get(key);
  if (row?.[field] === undefined) return errors;
  return new Map(errors).set(
    key,
    Object.fromEntries(Object.entries(row).filter(([name]) => name !== field)),
  );
}

function change(
  state: EditableRowsState,
  action: Extract<EditableRowsAction, { type: 'change' }>,
): EditableRowsState {
  const { key, field, value } = action;
  const errors = clearCellError(state.errors, key, field);
  const editedRow = state.edited.get(key);
  if (editedRow !== undefined) {
    const draft = { ...editedRow.draft, [field]: value };
    return { ...state, errors, edited: new Map(state.edited).set(key, { ...editedRow, draft }) };
  }
  const added = state.added.map((row) =>
    row.key === key ? { key, draft: { ...row.draft, [field]: value } } : row,
  );
  return { ...state, errors, added };
}

/** Puts a row into edit with what it was read with; a row already in edit keeps its typed values. */
function startEdit(
  state: EditableRowsState,
  action: Extract<EditableRowsAction, { type: 'edit' }>,
): EditableRowsState {
  if (state.edited.has(action.id)) return state;
  const row = { etag: action.etag, original: action.original, draft: action.original };
  return { ...state, edited: new Map(state.edited).set(action.id, row) };
}

/** "Set for selected": an empty field in the patch means "unchanged". */
function applyToRows(
  state: EditableRowsState,
  action: Extract<EditableRowsAction, { type: 'applyToRows' }>,
): EditableRowsState {
  const patch = Object.fromEntries(
    Object.entries(action.patch).filter(([, value]) => value !== ''),
  );
  const edited = new Map(state.edited);
  for (const id of action.ids) {
    const read = edited.get(id) ?? action.originals.get(id);
    if (read === undefined) continue;
    const draft = edited.get(id)?.draft ?? read.original;
    edited.set(id, { etag: read.etag, original: read.original, draft: { ...draft, ...patch } });
  }
  return { ...state, edited };
}

/** The one writer of the editable table's state: every update is a new object (immutable). */
export function editableRowsReducer(
  state: EditableRowsState,
  action: EditableRowsAction,
): EditableRowsState {
  switch (action.type) {
    case 'add':
      return {
        ...state,
        added: [{ key: nextKey(state.added), draft: action.draft }, ...state.added],
      };
    case 'removeNew':
      return {
        ...state,
        added: state.added.filter((row) => row.key !== action.key),
        errors: withoutKey(state.errors, action.key),
      };
    case 'edit':
      return startEdit(state, action);
    case 'change':
      return change(state, action);
    case 'undo':
      return {
        ...state,
        edited: withoutKey(state.edited, action.key),
        errors: withoutKey(state.errors, action.key),
      };
    case 'applyToRows':
      return applyToRows(state, action);
    case 'setErrors':
      return { ...state, errors: action.errors };
    case 'markStale':
      return { ...state, stale: new Set(action.ids.filter((id) => state.edited.has(id))) };
    case 'reset':
      return EMPTY_EDITABLE_ROWS;
  }
}

/** Added rows plus edited rows whose draft differs from what was read. */
export function dirtyCount(state: EditableRowsState): number {
  return state.added.length + [...state.edited.values()].filter(isChanged).length;
}

/** One row of the save body: `id` and `etag` on a changed row, neither on a new one. */
export interface BatchRow {
  readonly id?: number;
  readonly etag?: string;
  readonly [field: string]: DraftValue | number | undefined;
}

/**
 * The save body: added rows oldest first (no id, no etag), then the changed rows with their id as a
 * number and the etag they were read with; `keys[i]` names `rows[i]` for the issue mapping.
 */
export function toBatch(state: EditableRowsState): {
  readonly rows: readonly BatchRow[];
  readonly keys: readonly string[];
} {
  const added = [...state.added].reverse();
  const changed = [...state.edited].filter(([, row]) => isChanged(row));
  return {
    rows: [
      ...added.map((row): BatchRow => ({ ...row.draft })),
      ...changed.map(([id, row]): BatchRow => ({ ...row.draft, id: Number(id), etag: row.etag })),
    ],
    keys: [...added.map((row) => row.key), ...changed.map(([id]) => id)],
  };
}

const cellIssue = z.object({
  path: z.tuple([z.literal('rows'), z.number().int().nonnegative(), z.string()]).rest(z.unknown()),
});

/** Each issue on `['rows', i, field]` within the sent batch becomes `errors[keys[i]][field]`; anything else is ignored. */
export function errorsFromIssues(
  issues: unknown,
  keys: readonly string[],
  text: (field: string, issue: unknown) => string,
): EditableRowsState['errors'] {
  const errors = new Map<string, Readonly<Record<string, string>>>();
  if (!Array.isArray(issues)) return errors;
  for (const issue of issues) {
    const parsed = cellIssue.safeParse(issue);
    const key = parsed.success ? keys[parsed.data.path[1]] : undefined;
    if (!parsed.success || key === undefined) continue;
    const field = parsed.data.path[2];
    errors.set(key, { ...errors.get(key), [field]: text(field, issue) });
  }
  return errors;
}

const staleIssue = z.object({ id: z.union([z.string().min(1), z.number().int()]) });

/** A 412's `issues` (`[{ id }]`) as row ids; anything malformed is skipped. */
export function staleIdsFromIssues(issues: unknown): readonly string[] {
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue) => {
    const parsed = staleIssue.safeParse(issue);
    return parsed.success ? [String(parsed.data.id)] : [];
  });
}

/** The editable table's state in a reducer, with the dirty count derived in render (no effect). */
export function useEditableRows(): {
  readonly state: EditableRowsState;
  readonly dispatch: (action: EditableRowsAction) => void;
  readonly dirty: number;
} {
  const [state, dispatch] = useReducer(editableRowsReducer, EMPTY_EDITABLE_ROWS);
  return { state, dispatch, dirty: dirtyCount(state) };
}
