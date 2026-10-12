'use client';

import { useTranslations } from 'next-intl';
import {
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { RowActions, type RowAction } from '@/components/molecules/RowActions';
import {
  CellInput,
  EmptyAsNone,
  FRAME_FADE,
  OPAQUE_ROW,
  STICKY_ACTIONS_CELL,
  STICKY_ACTIONS_HEAD,
  editableCellId,
  readText,
  type EditableColumn,
} from '@/components/templates/EditableTable';
import { Skeleton } from '@/components/ui/skeleton';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Draft, DraftValue } from '@/lib/hooks/use-editable-rows';
import { cn } from '@/lib/utils';

/** One line of a document: a stable key and its values by field. */
export interface DocumentLine {
  readonly key: string;
  readonly values: Draft;
}

export interface DocumentLinesColumn {
  readonly id: string;
  /** The header, already translated. */
  readonly label: string;
  /** The edit-mode control (`CellInput`); absent: the column reads in edit mode too. */
  readonly input?: EditableColumn;
  /** A second control stacked under the first (Cost center, then Items Notes). */
  readonly below?: EditableColumn;
  /** The read cell; default the value of `values[id]` as text (a long text wraps in its box). */
  readonly read?: (line: DocumentLine, index: number) => ReactNode;
  /** A custom cell in both modes (a dialog button, a link); wins over `input` and `read`. */
  readonly cell?: (line: DocumentLine, index: number, mode: 'edit' | 'read') => ReactNode;
  /** `start`: sticky at the inline start from `md`, 240px. `end`: sticky at the inline end, 112px. */
  readonly pin?: 'start' | 'end';
  /** Numbers align to the end in tabular figures. */
  readonly align?: 'start' | 'end';
}

export interface DocumentLinesEditorProps {
  readonly mode: 'edit' | 'read';
  /** The table's accessible name. */
  readonly caption: string;
  readonly columns: readonly DocumentLinesColumn[];
  /** `undefined` while the document loads: three skeleton rows (D-39). */
  readonly lines: readonly DocumentLine[] | undefined;
  /** Line key to field to message, already translated. */
  readonly errors?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly onChange?: (index: number, field: string, value: DraftValue) => void;
  readonly onMove?: (from: number, to: number) => void;
  readonly onRemove?: (index: number) => void;
  /** Edit mode: the row above the grid (the feature's item picker). */
  readonly picker?: ReactNode;
  /** A 14px definition list under the grid at the inline end. */
  readonly totals?: readonly { readonly term: string; readonly value: string }[];
  /** Under "No lines yet" when there is no line. */
  readonly emptyBody: string;
  /**
   * Opt-in (04.6-14): the cells' id prefix, so a form's error summary can link "Line {n}: {column}"
   * to a cell and a new line's first cell can take focus (`editableCellId(idPrefix, key, field)`);
   * absent, a generated one.
   */
  readonly idPrefix?: string;
}

/** A pinned end column's width (the 6rem number box and its two 0.5rem gutters), as in EditableTable. */
const PIN_REM = 7;
/** The 48px actions column the end pins sit after in edit mode. */
const ACTIONS_REM = 3;
const SKELETON_LINES = 3;
const NO_ERRORS: Readonly<Record<string, string>> = {};
const REQUIRED_MARK = '*';
/** The keys of these inputs belong to the grid; date and choice keep their native keys. */
const GRID_KEYS: ReadonlySet<EditableColumn['kind']> = new Set<EditableColumn['kind']>([
  'text',
  'number',
]);

// The item's code and name wrap inside their column at every width, never clipped (the 04.6-04
// review at 375): 160px below md, where the quantity's end pin would otherwise cover a 240px item,
// 240px and sticky from md; a long-text box in it is held to the column too. In edit mode the 48px
// actions column is pinned beside the quantity, so below md the item takes 96px (the 04.6-14 review
// at 375: a 295px frame holds the line number, 96px of item and the 160px of pins, nothing covered).
const START_PIN_BASE =
  'whitespace-normal wrap-anywhere *:max-w-full md:sticky md:z-[1] md:w-60 md:min-w-60 md:max-w-60 md:border-e';
const START_PIN_READ = `w-40 min-w-40 max-w-40 ${START_PIN_BASE}`;
const START_PIN_EDIT = `w-24 min-w-24 max-w-24 ${START_PIN_BASE}`;
const END_PIN = 'sticky z-[1] w-28 min-w-28 max-w-28';
const END_RULE = 'border-s';
/**
 * The least width of a control by kind: the primitive input is `min-w-0`, so a wide table would
 * squeeze a lot number to a sliver; a number (6rem) and a date (10rem) size themselves.
 */
const CONTROL_MIN: Partial<Record<EditableColumn['kind'], string>> = {
  text: 'min-w-32',
  textarea: 'min-w-48',
  choice: 'min-w-40',
  multiChoice: 'min-w-48',
};

const asText = (value: DraftValue | undefined): string => {
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value.join(', ') : '';
};

interface Pin {
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** Each column's sticky place: end pins count the pinned columns after them, then the actions. */
function pinsOf(
  columns: readonly DocumentLinesColumn[],
  withActions: boolean,
): ReadonlyMap<string, Pin> {
  const pins = new Map<string, Pin>();
  const ends = columns.filter((column) => column.pin === 'end');
  const base = withActions ? ACTIONS_REM : 0;
  ends.forEach((column, index) => {
    const after = ends.length - 1 - index;
    pins.set(column.id, {
      className: cn(END_PIN, index === 0 && END_RULE),
      style: { insetInlineEnd: `${String(base + after * PIN_REM)}rem` },
    });
  });
  for (const column of columns) {
    if (column.pin === 'start') {
      pins.set(column.id, {
        className: withActions ? START_PIN_EDIT : START_PIN_READ,
        style: { insetInlineStart: '0rem' },
      });
    }
  }
  return pins;
}

const alignClass = (column: DocumentLinesColumn): string | undefined =>
  column.align === 'end' ? 'text-end tabular-nums' : undefined;

/** The value shown by a read cell: the column's own, else the field as text; empty reads "None". */
function ReadValue({
  column,
  line,
  index,
}: {
  readonly column: DocumentLinesColumn;
  readonly line: DocumentLine;
  readonly index: number;
}): ReactNode {
  const value = column.read?.(line, index) ?? readText(asText(line.values[column.id]));
  const note = column.below === undefined ? '' : asText(line.values[column.below.id]);
  return (
    <>
      <EmptyAsNone value={value} />
      {note === '' ? null : (
        <span className="text-muted-foreground block text-xs whitespace-pre-line">{note}</span>
      )}
    </>
  );
}

/** A body cell's place: the gutters of the mode, the alignment, the pin on the row's background. */
function placeOf(
  column: DocumentLinesColumn,
  pins: ReadonlyMap<string, Pin>,
  edit: boolean,
): { readonly className: string; readonly style: CSSProperties | undefined } {
  const pin = pins.get(column.id);
  return {
    className: cn(
      edit ? 'px-2 py-1 align-top' : 'px-4 py-2 align-middle',
      alignClass(column),
      pin?.className,
      pin !== undefined && 'bg-inherit',
    ),
    style: pin?.style,
  };
}

interface GridShape {
  readonly columns: readonly DocumentLinesColumn[];
  readonly pins: ReadonlyMap<string, Pin>;
  readonly edit: boolean;
  readonly withActions: boolean;
}

/** One loading row: a bar per column, shaped like the line it stands for (D-39). */
function SkeletonRow({ columns, pins, edit, withActions }: GridShape): ReactElement {
  return (
    <TableRow data-testid="lines-loading" className="h-12 hover:bg-transparent">
      <TableCell className="px-4">
        <Skeleton className="h-4 w-4" />
      </TableCell>
      {columns.map((column) => {
        const place = placeOf(column, pins, edit);
        return (
          <TableCell key={column.id} className={place.className} style={place.style}>
            <Skeleton className="h-4 w-full min-w-16" />
          </TableCell>
        );
      })}
      {withActions ? (
        <TableCell className={cn('w-12 min-w-12 max-w-12', STICKY_ACTIONS_CELL)} />
      ) : null}
    </TableRow>
  );
}

/** One line: its number, its cells, and its actions when the grid has them. */
function LineRow({
  shape,
  line,
  index,
  content,
  actions,
}: {
  readonly shape: GridShape;
  readonly line: DocumentLine;
  readonly index: number;
  readonly content: (column: DocumentLinesColumn) => ReactNode;
  readonly actions: ReactNode;
}): ReactElement {
  return (
    <TableRow data-line-key={line.key} className={cn('h-12', OPAQUE_ROW)}>
      <TableCell
        className={cn(
          'w-12 px-4 text-end tabular-nums',
          shape.edit ? 'py-1 align-top leading-8' : 'py-2',
        )}
      >
        {index + 1}
      </TableCell>
      {shape.columns.map((column) => {
        const place = placeOf(column, shape.pins, shape.edit);
        return (
          <TableCell key={column.id} className={place.className} style={place.style}>
            {content(column)}
          </TableCell>
        );
      })}
      {shape.withActions ? (
        <TableCell
          className={cn('w-12 min-w-12 max-w-12 px-1 py-1 align-top', STICKY_ACTIONS_CELL)}
        >
          {actions}
        </TableCell>
      ) : null}
    </TableRow>
  );
}

/** The header row: the hidden "Line", each label (its asterisk while editing), the hidden "Actions". */
function LinesHeader({ columns, pins, edit, withActions }: GridShape): ReactElement {
  const t = useTranslations('common');
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className="bg-muted h-10 w-12 px-4">
          <span className="sr-only">{t('line')}</span>
        </TableHead>
        {columns.map((column) => (
          <TableHead
            key={column.id}
            className={cn(
              'bg-muted h-10 whitespace-normal',
              edit ? 'px-2' : 'px-4',
              alignClass(column),
              pins.get(column.id)?.className,
            )}
            style={pins.get(column.id)?.style}
          >
            {column.label}
            {edit && column.input?.required === true ? (
              <span aria-hidden="true" className="text-destructive ms-1">
                {REQUIRED_MARK}
              </span>
            ) : null}
          </TableHead>
        ))}
        {withActions ? (
          <TableHead
            className={cn('bg-muted h-10 w-12 min-w-12 max-w-12 px-1', STICKY_ACTIONS_HEAD)}
          >
            <span className="sr-only">{t('actions')}</span>
          </TableHead>
        ) : null}
      </TableRow>
    </TableHeader>
  );
}

/** The totals slot: a 14px definition list at the inline end. */
function LinesTotals({
  totals,
}: {
  readonly totals: NonNullable<DocumentLinesEditorProps['totals']>;
}): ReactElement {
  return (
    <div className="flex justify-end">
      <dl data-testid="lines-totals" className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
        {totals.map((total) => (
          <div key={total.term} className="contents">
            <dt className="font-semibold">{total.term}</dt>
            <dd className="text-end tabular-nums">{total.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The cells' id prefix: the opt-in one, else a generated one (a hook is always called). */
function useLinesId(prefix: string | undefined): string {
  const generated = useId();
  return prefix ?? generated;
}

/**
 * K14 (04.6 UI-SPEC § Kit additions, § Lines editor): the one lines grid of a document (CONTEXT
 * carried-forward "the line grid is built once as a kit document-lines editor"). Edit mode on a form, read mode on a detail page, the same columns.
 *
 * - **Cells** are `EditableTable`'s own `CellInput` (never a copy), named "Line {n}: {column}", with
 *   the error under the input, `aria-invalid` and `aria-describedby`; `below` stacks a second control
 *   in the same cell; a column without `input` reads in edit mode too; `cell` draws a custom one.
 * - **Pins:** a `start` column (the item) sticks at the inline start from `md` (240px, a 1px rule);
 *   `end` columns (the quantity typed) stick at the inline end at every width, 112px each, after the
 *   48px actions column in edit mode; the frame scrolls between them. Logical insets only (FE-20).
 * - **Keyboard** (text and number inputs; date and choice keep their native keys): Enter moves to
 *   the same column on the next line (nothing on the last); Esc restores the value held when the
 *   input got focus. Handlers and a ref only, no effect (FE-04).
 * - **Line actions** (edit mode, `RowActions` compact, "Actions for line {n}"): Move line up (not on
 *   the first), Move line down (not on the last), then Remove line (destructive), Perfex's drag
 *   handle made keyboard reachable.
 * - **States:** three skeleton rows while `lines` is undefined, never the empty text (D-39); "No
 *   lines yet" and `emptyBody` inside the table body for `[]`.
 * - **Frame:** the scrolling frame is a region named "{caption}, scrolls sideways" in the tab order,
 *   so a read grid (nothing inside to focus) still scrolls by keyboard.
 * - **Slots:** `picker` above the grid in edit mode; `totals` as a definition list at the inline end.
 *
 * It does not fetch data and has no validation rules of its own: the feature passes `errors`, the
 * translated words and the picker. A template (FE-06): it imports `ui/`, molecules and the
 * `EditableTable` template, never a feature (FE-07). Values render as React text (T-4.6-28).
 */
export function DocumentLinesEditor({
  mode,
  caption,
  columns,
  lines,
  errors,
  onChange,
  onMove,
  onRemove,
  picker,
  totals,
  emptyBody,
  idPrefix,
}: DocumentLinesEditorProps): ReactElement {
  const t = useTranslations('common');
  const formId = useLinesId(idPrefix);
  const edit = mode === 'edit';
  const withActions = edit && (onMove !== undefined || onRemove !== undefined);
  const shape: GridShape = { columns, pins: pinsOf(columns, withActions), edit, withActions };
  /** The value an input held when it got focus (Esc brings it back). */
  const held = useRef<{ readonly id: string; readonly value: DraftValue } | null>(null);

  function restore(index: number, line: DocumentLine, field: string): void {
    const id = editableCellId(formId, line.key, field);
    if (held.current?.id === id) onChange?.(index, field, held.current.value);
  }

  function moveDown(index: number, field: string): void {
    const next = lines?.[index + 1];
    if (next === undefined) return;
    document.getElementById(editableCellId(formId, next.key, field))?.focus();
  }

  function keyDown(
    index: number,
    input: EditableColumn,
    event: KeyboardEvent<HTMLInputElement>,
  ): void {
    const line = lines?.[index];
    if (line === undefined || !GRID_KEYS.has(input.kind)) return;
    if (event.key === 'Escape') {
      restore(index, line, input.id);
      return;
    }
    if (event.key !== 'Enter') return;
    // Never the form's submit: Enter walks down the column.
    event.preventDefault();
    moveDown(index, input.id);
  }

  function control(
    line: DocumentLine,
    index: number,
    input: EditableColumn,
    stacked = false,
  ): ReactElement {
    const id = editableCellId(formId, line.key, input.id);
    return (
      // Not a control: it records the value its input held when focused, for Esc.
      <div
        // A cell error wraps under its input instead of widening the column (cells are nowrap).
        className={cn('whitespace-normal', CONTROL_MIN[input.kind])}
        onFocus={() => {
          if (held.current?.id !== id) held.current = { id, value: line.values[input.id] ?? '' };
        }}
        onBlur={() => {
          held.current = null;
        }}
      >
        <CellInput
          id={id}
          name={t('line_column', { n: index + 1, column: input.label })}
          column={input}
          value={line.values[input.id]}
          error={(errors?.[line.key] ?? NO_ERRORS)[input.id]}
          autoFocus={false}
          // A stacked control has no header of its own: its label shows as its hint.
          {...(stacked ? { placeholder: input.label } : {})}
          onChange={(value) => {
            onChange?.(index, input.id, value);
          }}
          onKeyDown={(event) => {
            keyDown(index, input, event);
          }}
        />
      </div>
    );
  }

  function cellContent(column: DocumentLinesColumn, line: DocumentLine, index: number): ReactNode {
    if (column.cell !== undefined) return column.cell(line, index, mode);
    if (!edit || column.input === undefined) {
      return <ReadValue column={column} line={line} index={index} />;
    }
    return (
      <div className="flex flex-col gap-1">
        {control(line, index, column.input)}
        {column.below === undefined ? null : control(line, index, column.below, true)}
      </div>
    );
  }

  function lineActions(index: number, count: number): readonly RowAction[] {
    const move = (key: 'move_line_up' | 'move_line_down', to: number): RowAction => ({
      id: key,
      label: t(key),
      ariaLabel: t(key),
      icon: to < index ? 'arrow-up' : 'arrow-down',
      kind: 'neutral',
      onSelect: () => {
        onMove?.(index, to);
      },
    });
    const actions: RowAction[] = [];
    if (onMove !== undefined && index > 0) actions.push(move('move_line_up', index - 1));
    if (onMove !== undefined && index < count - 1) actions.push(move('move_line_down', index + 1));
    if (onRemove !== undefined) {
      actions.push({
        id: 'remove_line',
        label: t('remove_line'),
        ariaLabel: t('remove_line'),
        icon: 'trash-can',
        kind: 'destructive',
        onSelect: () => {
          onRemove(index);
        },
      });
    }
    return actions;
  }

  let body: ReactNode;
  if (lines === undefined) {
    body = Array.from({ length: SKELETON_LINES }, (_, row) => <SkeletonRow key={row} {...shape} />);
  } else if (lines.length === 0) {
    body = (
      <TableRow className="hover:bg-transparent">
        <TableCell
          colSpan={columns.length + 1 + Number(withActions)}
          className="px-4 py-8 text-center whitespace-normal"
        >
          <p className="text-sm font-semibold">{t('lines_empty_heading')}</p>
          <p className="text-muted-foreground text-sm">{emptyBody}</p>
        </TableCell>
      </TableRow>
    );
  } else {
    body = lines.map((line, index) => (
      <LineRow
        key={line.key}
        shape={shape}
        line={line}
        index={index}
        content={(column) => cellContent(column, line, index)}
        actions={
          <RowActions
            compact
            recordName={t('line_n', { n: index + 1 })}
            menuLabel={t('line_actions_named', { n: index + 1 })}
            actions={lineActions(index, lines.length)}
          />
        }
      />
    ));
  }

  return (
    <div className="flex flex-col gap-4">
      {edit && picker !== undefined ? <div>{picker}</div> : null}
      {/* Without the sticky actions, the frame's inline end fades while more of the table is that way. */}
      <div className={withActions ? undefined : FRAME_FADE}>
        {/* ui/table's frame, spelled out: a read grid has nothing to focus, so the frame itself is a
            named, keyboard-scrollable region (axe scrollable-region-focusable). */}
        <div
          data-slot="table-container"
          role="region"
          aria-label={t('lines_region', { caption })}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must be keyboard reachable (axe scrollable-region-focusable), the case the rule's own docs exempt per instance
          tabIndex={0}
          className="relative w-full overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <table
            data-slot="table"
            aria-label={caption}
            aria-busy={lines === undefined}
            className="w-full caption-bottom text-sm"
          >
            <LinesHeader {...shape} />
            <TableBody>{body}</TableBody>
          </table>
        </div>
      </div>
      {totals === undefined || totals.length === 0 ? null : <LinesTotals totals={totals} />}
    </div>
  );
}
