'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import { EmptyAsNone, textOf } from '@/components/molecules/EmptyAsNone';
import { RowActions, type RowAction } from '@/components/molecules/RowActions';
import { SearchableMultiSelect } from '@/components/molecules/SearchableMultiSelect';
import {
  SearchableSelect,
  type ChoiceOption,
  type EmptyHint,
} from '@/components/molecules/SearchableSelect';
import { SortableHeader, ariaSortFor } from '@/components/molecules/SortableHeader';
import {
  ConfirmDialog,
  useConfirmCopy,
  type ConfirmOutcome,
  type SummaryChange,
} from '@/components/organisms/ConfirmDialog';
import { ErrorSummary, type ErrorSummaryItem } from '@/components/organisms/ErrorSummary';
import { SaveBar } from '@/components/organisms/SaveBar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { isRetryableCode, type FeatureErrorCodes } from '@/lib/errors/error-messages';
import { useErrorText } from '@/lib/errors/use-error-text';
import {
  errorsFromIssues,
  sameDraftValue,
  staleIdsFromIssues,
  toBatch,
  type BatchRow,
  type Draft,
  type DraftValue,
  type EditableRowsAction,
  type EditableRowsState,
  type EditedRow,
} from '@/lib/hooks/use-editable-rows';
import { useUnsavedChanges } from '@/lib/hooks/use-unsaved-changes';
import { useFormat } from '@/lib/i18n/format';
import { cn } from '@/lib/utils';

/** One editable column: a `ListColumn` id and a `Draft` field. */
export interface EditableColumn {
  readonly id: string;
  readonly kind:
    'text' | 'number' | 'textarea' | 'checkbox' | 'choice' | 'multiChoice' | 'color' | 'date';
  /** The column header; a cell input is named `t('row_column', { row, column: label })`. */
  readonly label: string;
  /** `choice` (SearchableSelect) and `multiChoice` (SearchableMultiSelect with chips). */
  readonly options?: readonly ChoiceOption[];
  /** `choice`, `multiChoice`: "none yet, create one" while `options` is loaded and empty. */
  readonly emptyHint?: EmptyHint;
  /** The asterisk in the header while the table is in edit (a row edited or added, or the grid). */
  readonly required?: boolean;
}

/**
 * What a batch save answers: an `ApiResult` from `useCommonMutation` passes as is (a component never
 * imports `call-api`, FE-08, so the shape is written here).
 */
export type EditableSaveResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: string;
      readonly retryAfterS: number | null;
      readonly issues?: unknown;
    };

/** `ListPageTemplate`'s editable mode (K6): the one inline-edit contract of every W1 list. */
export interface EditableConfig<Row> {
  readonly mode: 'rows' | 'grid';
  readonly columns: readonly EditableColumn[];
  readonly rowId: (row: Row) => string;
  readonly toDraft: (row: Row) => Draft;
  /** The row's `etag` body field (ADR-0040). */
  readonly etagOf: (row: Row) => string;
  /** Present: the add button (`labels.addLabel`) and "Add another row". */
  readonly blankDraft?: () => Draft;
  /** Existing rows read-only (an "Add multiple" screen). */
  readonly addOnly?: boolean;
  /** A new row's name in labels and the summary; an existing row is named by the list's `recordName`. */
  readonly rowName: (draft: Draft) => string;
  /** Field to translated message ("Enter a number."); a non-empty answer stops the save. */
  readonly validate?: (draft: Draft) => Readonly<Record<string, string>>;
  readonly issueText: (field: string, issue: unknown) => string;
  readonly save: (body: { readonly rows: readonly BatchRow[] }) => Promise<EditableSaveResult>;
  readonly labels: {
    /** "Units": "Save changes to {list}?". */
    readonly listLabel: string;
    /** "Save units", "Create taxes". */
    readonly submit: string;
    /** "Saving units…". */
    readonly pending: string;
    /** "Units saved". */
    readonly savedToast: string;
    /** "Add unit". */
    readonly addLabel?: string;
    /** The save bar's count; absent: `t('rows_changed', { count })`. */
    readonly countLabel?: (count: number) => string;
    /** The summary's title; absent: `t('save_list_summary_title', { list: listLabel })`. */
    readonly summaryTitle?: (count: number) => string;
    /**
     * Opt-in (04.6-15): one line under the summary's title saying what the save does beyond the
     * changes listed ("Each change is written to the ledger.").
     */
    readonly summaryBody?: string;
  };
  readonly canEdit: boolean;
  readonly canAdd: boolean;
  /** Grid mode: "Set for selected". */
  readonly bulkSet?: {
    /** "Set levels". */
    readonly label: string;
    readonly title: string;
    /** "Apply to {count} items". */
    readonly applyLabel: (count: number) => string;
    /** The `EditableColumn` ids the dialog offers; an empty input leaves the cell unchanged. */
    readonly columns: readonly string[];
  };
  /**
   * Opt-in (04.6-15): grid mode pins its trailing number columns beside the row actions too (a grid
   * that adds rows has Undo and Remove new row), the actions held at a fixed 4rem; absent, a grid
   * pins them only when it has no actions column.
   */
  readonly pinNumbersWithActions?: true;
}

/** The `ListColumn` fields this table reads, structurally (the two templates never import in a cycle). */
export interface EditableTableColumn<Row> {
  readonly id: string;
  readonly header: string;
  readonly headerHidden?: boolean;
  readonly sortField?: string;
  readonly hideBelow?: 'md' | 'lg' | 'xl';
  readonly align?: 'start' | 'end';
  readonly primary?: boolean;
  readonly cell: (row: Row) => ReactNode;
}

/** The page's checked rows, as `ListPageTemplate` holds them. */
export interface EditableSelection {
  readonly keys: ReadonlySet<string>;
  readonly page: boolean | 'indeterminate';
  readonly toggleRow: (key: string, checked: boolean) => void;
  readonly togglePage: (checked: boolean) => void;
}

/** Tailwind sees only literal class names (RESEARCH Pitfall 11): each class is spelled out, never built. */
const HIDE_BELOW = {
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  // Opt-in (plan 04.6-06): a column the 1024 frame cannot hold beside the ones the page exists for.
  xl: 'hidden xl:table-cell',
} as const;
const ALIGN = { start: undefined, end: 'text-end tabular-nums' } as const;

/** A list column's responsive and alignment classes (shared with `ListPageTemplate`'s rows table). */
export const columnClass = (column: {
  readonly hideBelow?: 'md' | 'lg' | 'xl' | undefined;
  readonly align?: 'start' | 'end' | undefined;
}): string | undefined =>
  cn(
    column.hideBelow === undefined ? undefined : HIDE_BELOW[column.hideBelow],
    ALIGN[column.align ?? 'start'],
  );

/** A partly checked page is a filled box with a dash (the primitive draws a check on an empty box). */
export const INDETERMINATE =
  "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:[&_svg]:hidden data-[state=indeterminate]:before:h-0.5 data-[state=indeterminate]:before:w-2 data-[state=indeterminate]:before:rounded-full data-[state=indeterminate]:before:bg-current data-[state=indeterminate]:before:content-['']";

/** The summary shows this many lines, the rest behind "Show {n} more" (UI-SPEC § Editable table). */
const SUMMARY_LINES = 10;
const STALE_CODE = 'ERP-CORE-0013';
const VALIDATION_CODE = 'ERP-VALIDATION-0001';
const OK: ConfirmOutcome = { ok: true };
const NO_ERRORS: Readonly<Record<string, string>> = {};
const NO_DRAFT: Draft = {};
const NO_CELLS: EditableRowsState['errors'] = new Map();
const REQUIRED_MARK = '*';

/** A cell input's id: the error summary's links and the grid's Enter move find it by this. */
export const editableCellId = (formId: string, key: string, field: string): string =>
  `${formId}-${key}-${field}`;

const asText = (value: DraftValue | undefined): string => (typeof value === 'string' ? value : '');
const asList = (value: DraftValue | undefined): readonly string[] =>
  typeof value === 'object' ? value : [];

/** One row as the table draws it: a new row has no `row` and no `original`. */
interface RowModel<Row> {
  readonly key: string;
  readonly row: Row | null;
  readonly name: string;
  readonly original: Draft | null;
  readonly draft: Draft;
  /** Its editable cells are inputs. */
  readonly inputs: boolean;
  /** In edit (rows mode: the muted fill and Undo). */
  readonly edited: boolean;
  readonly stale: boolean;
  readonly errors: Readonly<Record<string, string>>;
}

/** One cell control's props: `CellInput` is shared with the document lines editor (K14). */
export interface CellInputProps {
  readonly id: string;
  /** The accessible name, "{row}: {column}". */
  readonly name: string;
  readonly column: EditableColumn;
  readonly value: DraftValue | undefined;
  /** The cell's error message, already translated. */
  readonly error: string | undefined;
  readonly autoFocus: boolean;
  readonly onChange: (value: DraftValue) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Opt-in: a text or textarea box's visible hint, for a control with no header of its own. */
  readonly placeholder?: string;
}

const errorIdOf = (props: CellInputProps): string | undefined =>
  props.error === undefined ? undefined : `${props.id}-error`;

const ariaOf = (props: CellInputProps) => ({
  'aria-invalid': props.error !== undefined,
  'aria-describedby': errorIdOf(props),
  'aria-required': props.column.required === true || undefined,
});

/** The visually hidden name of a cell's control (a table cell has no visible label). */
function HiddenLabel({ id, name }: { readonly id: string; readonly name: string }): ReactElement {
  return (
    <label htmlFor={id} className="sr-only">
      {name}
    </label>
  );
}

function TextCell(props: CellInputProps): ReactElement {
  const number = props.column.kind === 'number';
  return (
    <>
      <HiddenLabel id={props.id} name={props.name} />
      <Input
        id={props.id}
        type="text"
        autoComplete="off"
        inputMode={number ? 'decimal' : undefined}
        // A level or a price is short: a narrow box leaves the row's other columns in view.
        className={number ? 'w-24 text-end tabular-nums' : undefined}
        // Parity with Perfex's add grid: a new row's first cell takes the caret (FE-25 allows it).
        autoFocus={props.autoFocus}
        placeholder={props.placeholder}
        value={asText(props.value)}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        onKeyDown={props.onKeyDown}
        {...ariaOf(props)}
      />
    </>
  );
}

function TextareaCell(props: CellInputProps): ReactElement {
  return (
    <>
      <HiddenLabel id={props.id} name={props.name} />
      <Textarea
        id={props.id}
        rows={1}
        // The primitive sizes itself to its content: an empty note would collapse to a sliver.
        className="min-h-8 min-w-48"
        autoFocus={props.autoFocus}
        placeholder={props.placeholder}
        value={asText(props.value)}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        {...ariaOf(props)}
      />
    </>
  );
}

/**
 * K15 (04.6 UI-SPEC § Kit additions): a native date input (the browser's own picker, no library);
 * the draft holds `YYYY-MM-DD` or `''`, the form the api reads and writes.
 */
function DateCell(props: CellInputProps): ReactElement {
  return (
    <>
      <HiddenLabel id={props.id} name={props.name} />
      <Input
        id={props.id}
        type="date"
        className="w-40 tabular-nums"
        autoFocus={props.autoFocus}
        value={asText(props.value)}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        onKeyDown={props.onKeyDown}
        {...ariaOf(props)}
      />
    </>
  );
}

/** A yes/no: a checkbox beside the column's word, named "{row}: {column}". */
function CheckboxCell(props: CellInputProps): ReactElement {
  return (
    <Label htmlFor={props.id} className="font-normal">
      <Checkbox
        id={props.id}
        autoFocus={props.autoFocus}
        checked={props.value === true}
        onCheckedChange={(next) => {
          props.onChange(next === true);
        }}
        {...ariaOf(props)}
      />
      <span aria-hidden="true">{props.column.label}</span>
      <span className="sr-only">{props.name}</span>
    </Label>
  );
}

function ChoiceCell(props: CellInputProps): ReactElement {
  const value = asText(props.value);
  return (
    <>
      <HiddenLabel id={props.id} name={props.name} />
      <SearchableSelect
        id={props.id}
        options={props.column.options ?? []}
        value={value === '' ? null : value}
        onChange={(next) => {
          props.onChange(next ?? '');
        }}
        invalid={props.error !== undefined}
        describedBy={errorIdOf(props)}
        required={props.column.required}
        emptyHint={props.column.emptyHint}
      />
    </>
  );
}

function MultiChoiceCell(props: CellInputProps): ReactElement {
  return (
    <>
      <HiddenLabel id={props.id} name={props.name} />
      <SearchableMultiSelect
        id={props.id}
        options={props.column.options ?? []}
        value={asList(props.value)}
        onChange={props.onChange}
        invalid={props.error !== undefined}
        describedBy={errorIdOf(props)}
        required={props.column.required}
        emptyHint={props.column.emptyHint}
      />
    </>
  );
}

/**
 * A native colour input plus the hex as text (UI-SPEC § Settings, Colors). A colour input has no
 * empty state and draws black, so an unset value says "None" beside it.
 */
function ColorCell(props: CellInputProps): ReactElement {
  const t = useTranslations('common');
  const hex = asText(props.value);
  return (
    <div className="flex items-center gap-2">
      <HiddenLabel id={props.id} name={props.name} />
      <Input
        id={props.id}
        type="color"
        className="w-12 p-1"
        autoFocus={props.autoFocus}
        value={hex}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        {...ariaOf(props)}
      />
      {hex === '' ? <span>{t('none')}</span> : <bdi className="tabular-nums">{hex}</bdi>}
    </div>
  );
}

const CELL_INPUT: Readonly<
  Record<EditableColumn['kind'], (props: CellInputProps) => ReactElement>
> = {
  text: TextCell,
  number: TextCell,
  textarea: TextareaCell,
  checkbox: CheckboxCell,
  choice: ChoiceCell,
  multiChoice: MultiChoiceCell,
  color: ColorCell,
  date: DateCell,
};

/**
 * The control a cell's kind names, with its error line under it (the row grows). Exported for the
 * document lines editor (K14), which reuses these inputs rather than copying them.
 */
export function CellInput(props: CellInputProps): ReactElement {
  const Control = CELL_INPUT[props.column.kind];
  return (
    <div className="flex flex-col gap-1">
      <Control {...props} />
      {props.error === undefined ? null : (
        // On the background, not the edited row's muted fill: red on muted fails AA (FE-25).
        <p id={errorIdOf(props)} className="text-destructive bg-background rounded-sm px-1 text-sm">
          {props.error}
        </p>
      )}
    </div>
  );
}

interface EditableCellProps<Row> {
  readonly formId: string;
  readonly model: RowModel<Row>;
  readonly column: EditableTableColumn<Row>;
  readonly editable: EditableColumn | undefined;
  /** The first cell carries "New" or the stale mark. */
  readonly first: boolean;
  readonly autoFocus: boolean;
  readonly grid: boolean;
  /** Grid mode: the pinned trailing columns and their inline-end offsets in rem (`pinnedColumns`). */
  readonly pins: ReadonlyMap<string, number>;
  readonly rowHref: (row: Row) => string;
  readonly onOpen: (row: Row) => void;
  readonly onChange: (field: string, value: DraftValue) => void;
  readonly onKeyDown: (field: string, event: KeyboardEvent<HTMLInputElement>) => void;
}

/** "New" on a new row, or the stale mark (16px triangle and its caption), in the row's first cell. */
function RowMark({
  isNew,
  stale,
}: {
  readonly isNew: boolean;
  readonly stale: boolean;
}): ReactElement | null {
  const t = useTranslations('common');
  if (isNew) return <span className="text-muted-foreground block text-xs">{t('row_new')}</span>;
  if (!stale) return null;
  return (
    <span className="flex items-center gap-1 text-xs">
      <Icon name="triangle-exclamation" className="size-4 shrink-0" />
      <span>{t('row_stale')}</span>
    </span>
  );
}

/** Longer than this (or holding a line break), a read text may wrap; up to it, it keeps one line. */
const LONG_TEXT = 32;

/**
 * The box a long read text wraps in (quick 261003-stt, 261003-ovf): between 10rem (160px) and 320px
 * wide, keeping its own line breaks, so a squeezed table never folds it into a narrow column of
 * many lines; inline-block keeps the column's text alignment.
 */
export const LONG_TEXT_BOX =
  'inline-block max-w-xs min-w-40 align-middle break-words whitespace-pre-line';

/**
 * The row actions cell (quick 261003-ovf), body and header: `sticky-actions` (app/globals.css) holds
 * it at the table's inline end with a 1px rule while the frame scrolls; a body cell takes the row's
 * background, which `OPAQUE_ROW` makes solid so no text shows through.
 */
export const STICKY_ACTIONS_CELL = 'sticky-actions bg-inherit';
export const STICKY_ACTIONS_HEAD = 'sticky-actions';
/** A table without that column: `table-frame-fade` (app/globals.css) fades its frame's inline end while it scrolls. */
export const FRAME_FADE = 'table-frame-fade';
// The primitive's row tints are half see-through: the same tint mixed over the page's background
// reads the same and stays solid behind the sticky cell (each class spelled out for Tailwind).
export const OPAQUE_ROW =
  'bg-background hover:bg-[color-mix(in_oklab,var(--color-muted)_50%,var(--color-background))] has-aria-expanded:bg-[color-mix(in_oklab,var(--color-muted)_50%,var(--color-background))]';

/** A pinned column's width: the grid's 6rem number box and its two 0.5rem gutters. */
const PIN_REM = 7;
/** The fixed row actions beside pinned columns (`pinNumbersWithActions`): one 32px icon button and its gutters. */
const ACTIONS_REM = 4;
const FIXED_ACTIONS = 'w-16 max-w-16 min-w-16';

/**
 * Grid mode without an actions column (or beside it, `pinNumbersWithActions`): the trailing number
 * columns (the values the grid is for) stay at the table's inline end while the frame scrolls, each
 * 7rem wide, so no data width pushes them out of view; the value is the column's inline-end offset
 * in rem (the fixed 4rem actions first when they sit beside it).
 */
function pinnedColumns<Row>(
  columns: readonly EditableTableColumn<Row>[],
  editables: ReadonlyMap<string, EditableColumn>,
  config: Pick<EditableConfig<Row>, 'mode' | 'pinNumbersWithActions'>,
  hasActions: boolean,
): ReadonlyMap<string, number> {
  const pins = new Map<string, number>();
  const beside = config.pinNumbersWithActions === true && hasActions;
  if (config.mode !== 'grid' || (hasActions && !beside)) return pins;
  const startRem = beside ? ACTIONS_REM : 0;
  for (const column of [...columns].reverse()) {
    if (editables.get(column.id)?.kind !== 'number') break;
    pins.set(column.id, startRem + pins.size * PIN_REM);
  }
  return pins;
}

/** The sticky place of a pinned column (none for any other); the first pinned one draws the rule. */
function pinOf(
  pins: ReadonlyMap<string, number>,
  id: string,
): { readonly className?: string; readonly style?: CSSProperties } {
  const offset = pins.get(id);
  if (offset === undefined) return {};
  return {
    className: cn(
      'sticky z-[1] w-28 max-w-28 min-w-28',
      offset === Math.max(...pins.values()) && 'border-s',
    ),
    style: { insetInlineEnd: `${String(offset)}rem` },
  };
}

export const isLongText = (value: ReactNode): boolean => {
  const text = textOf(value);
  return text !== null && (text.length > LONG_TEXT || text.includes('\n'));
};

/** A plain list's text cell by the same rule: a long text in the long-text box, a short one as is. */
export function readText(text: string): ReactNode {
  return isLongText(text) ? <span className={LONG_TEXT_BOX}>{text}</span> : text;
}

/**
 * Opt-in (plan 04.8-09): a date and time cell on two lines, the time at caption size under the
 * date, so a narrow column holds one date's width. It takes
 * `useFormat().dateTime`'s text, which is always the date, one space, then the time.
 */
export function readDateTime(text: string): ReactNode {
  const gap = text.indexOf(' ');
  if (gap === -1) return <bdi className="tabular-nums">{text}</bdi>;
  return (
    <span className="flex flex-col tabular-nums">
      <bdi>{text.slice(0, gap)}</bdi>
      <bdi className="text-muted-foreground text-xs">{text.slice(gap + 1)}</bdi>
    </span>
  );
}

/** What a read cell shows: the column's own cell, the primary one as the record's link. */
function ReadCell<Row>({
  column,
  row,
  rowHref,
  onOpen,
}: {
  readonly column: EditableTableColumn<Row>;
  readonly row: Row;
  readonly rowHref: (row: Row) => string;
  readonly onOpen: (row: Row) => void;
}): ReactNode {
  const cell = column.cell(row);
  const value = <EmptyAsNone value={cell} />;
  const content =
    column.primary === true ? (
      <Link
        data-row-link=""
        href={rowHref(row)}
        className="hover:underline focus-visible:underline"
        onClick={() => {
          onOpen(row);
        }}
      >
        {value}
      </Link>
    ) : (
      value
    );
  // A long text wraps between 160 and 320px (keeping its own line breaks); a short value (and any
  // non-text cell) keeps one line, so the squeeze lands on the long text only.
  if (!isLongText(cell)) return content;
  return <div className={LONG_TEXT_BOX}>{content}</div>;
}

/**
 * A read row centres every cell on its buttons; a row of inputs tops them, so the inputs stay in
 * line when an error line grows one cell.
 */
const rowAlign = (model: { readonly inputs: boolean }): string =>
  model.inputs ? 'align-top' : 'align-middle';

/** Every editable column stays at every width: a hidden column would hide a field in edit. */
function placeClass(
  column: Parameters<typeof columnClass>[0],
  editable: EditableColumn | undefined,
): string | undefined {
  return editable === undefined ? columnClass(column) : ALIGN[column.align ?? 'start'];
}

/** Grid: a cell whose value differs from what was read is muted, with a hidden "Changed". */
function isChangedCell<Row>({ grid, editable, model, column }: EditableCellProps<Row>): boolean {
  return (
    grid &&
    editable !== undefined &&
    model.inputs &&
    model.original !== null &&
    !sameDraftValue(model.original[column.id], model.draft[column.id])
  );
}

function EditableCell<Row>(props: EditableCellProps<Row>): ReactElement {
  const t = useTranslations('common');
  const { model, column, editable } = props;
  const input = editable !== undefined && model.inputs;
  const changed = isChangedCell(props);
  const pin = pinOf(props.pins, column.id);
  return (
    <TableCell
      className={cn(
        'px-4 py-1',
        rowAlign(model),
        placeClass(column, editable),
        pin.className !== undefined && cn(pin.className, 'bg-inherit'),
        changed && 'bg-muted',
      )}
      style={pin.style}
    >
      {props.first ? <RowMark isNew={model.row === null} stale={model.stale} /> : null}
      {input ? (
        <CellInput
          id={editableCellId(props.formId, model.key, column.id)}
          name={t('row_column', { row: model.name, column: editable.label })}
          column={editable}
          value={model.draft[column.id]}
          error={model.errors[column.id]}
          autoFocus={props.autoFocus}
          onChange={(value) => {
            props.onChange(column.id, value);
          }}
          onKeyDown={(event) => {
            props.onKeyDown(column.id, event);
          }}
        />
      ) : null}
      {!input && model.row !== null ? (
        <ReadCell column={column} row={model.row} rowHref={props.rowHref} onOpen={props.onOpen} />
      ) : null}
      {changed ? <span className="sr-only">{t('cell_changed')}</span> : null}
    </TableCell>
  );
}

interface RowActionsCellProps<Row> {
  readonly model: RowModel<Row>;
  readonly config: EditableConfig<Row>;
  readonly rowActions: ((row: Row) => readonly RowAction[]) | undefined;
  readonly dispatch: (action: EditableRowsAction) => void;
}

/** One icon button of a row in edit or a new row: Undo, or Remove new row. */
function RowIconButton({
  label,
  icon,
  onClick,
}: {
  readonly label: string;
  readonly icon: 'xmark' | 'rotate-right';
  readonly onClick: () => void;
}): ReactElement {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
      <Icon name={icon} />
    </Button>
  );
}

/** A new row: Remove new row. A row in edit: Undo. Otherwise the kit's Edit and the feature's actions. */
function RowActionsCell<Row>({
  model,
  config,
  rowActions,
  dispatch,
}: RowActionsCellProps<Row>): ReactElement {
  const t = useTranslations('common');
  const row = model.row;
  if (row === null) {
    return (
      <RowIconButton
        label={t('remove_new_row')}
        icon="xmark"
        onClick={() => {
          dispatch({ type: 'removeNew', key: model.key });
        }}
      />
    );
  }
  if (model.edited) {
    return (
      <RowIconButton
        label={t('undo_row', { name: model.name })}
        icon="rotate-right"
        onClick={() => {
          dispatch({ type: 'undo', key: model.key });
        }}
      />
    );
  }
  const edit: readonly RowAction[] =
    config.mode === 'rows' && config.canEdit && config.addOnly !== true
      ? [
          {
            id: 'edit',
            label: t('edit'),
            ariaLabel: t('edit_row', { name: model.name }),
            icon: 'pen-to-square',
            kind: 'main',
            onSelect: () => {
              dispatch({
                type: 'edit',
                id: model.key,
                etag: config.etagOf(row),
                original: config.toDraft(row),
              });
            },
          },
        ]
      : [];
  return (
    <RowActions compact recordName={model.name} actions={[...edit, ...(rowActions?.(row) ?? [])]} />
  );
}

interface EditableRowProps<Row> extends Omit<
  EditableCellProps<Row>,
  'column' | 'editable' | 'first' | 'autoFocus'
> {
  readonly columns: readonly EditableTableColumn<Row>[];
  readonly editables: ReadonlyMap<string, EditableColumn>;
  /** The column whose input takes focus when a new row appears. */
  readonly focusColumn: string | undefined;
  readonly selection: EditableSelection | null;
  /** `undefined`: the table has no actions column. */
  readonly actions: ReactNode;
}

function EditableRow<Row>({
  columns,
  editables,
  focusColumn,
  selection,
  actions,
  ...cell
}: EditableRowProps<Row>): ReactElement {
  const t = useTranslations('common');
  const { model } = cell;
  const checked = selection?.keys.has(model.key) === true;
  return (
    <TableRow
      data-row-key={model.key}
      className={cn('h-12', OPAQUE_ROW, model.edited && !cell.grid && 'bg-muted hover:bg-muted')}
      {...(checked ? { 'data-state': 'selected' } : {})}
    >
      {selection === null ? null : (
        <TableCell className={cn('w-10 px-4 py-1', rowAlign(model))}>
          {model.row === null ? null : (
            <Checkbox
              aria-label={t('select_row', { name: model.name })}
              checked={checked}
              onCheckedChange={(next) => {
                selection.toggleRow(model.key, next === true);
              }}
            />
          )}
        </TableCell>
      )}
      {columns.map((column, index) => (
        <EditableCell
          key={column.id}
          {...cell}
          column={column}
          editable={editables.get(column.id)}
          first={index === 0}
          autoFocus={model.row === null && column.id === focusColumn}
        />
      ))}
      {actions === undefined ? null : (
        <TableCell
          className={cn(
            'px-4 py-1 text-end',
            STICKY_ACTIONS_CELL,
            rowAlign(model),
            cell.pins.size > 0 && FIXED_ACTIONS,
          )}
        >
          {actions}
        </TableCell>
      )}
    </TableRow>
  );
}

/**
 * A column header: the sort control when the column sorts, the asterisk when the cell is required
 * and the table is in edit (never on the read-only list, lead 2026-10-03).
 */
function EditableHead<Row>({
  column,
  editable,
  pins,
  editing,
  sort,
  onSort,
}: {
  readonly column: EditableTableColumn<Row>;
  readonly editable: EditableColumn | undefined;
  readonly pins: ReadonlyMap<string, number>;
  readonly editing: boolean;
  readonly sort: string | null;
  readonly onSort: (next: string | null) => void;
}): ReactElement {
  return (
    <TableHead
      className={cn(
        'bg-muted h-10 px-4',
        placeClass(column, editable),
        // Its cells are narrow boxes: a long header wraps above them instead of widening the table.
        editable?.kind === 'number' && 'h-auto py-2 whitespace-normal',
        pinOf(pins, column.id).className,
      )}
      style={pinOf(pins, column.id).style}
      {...(column.sortField === undefined
        ? {}
        : { 'aria-sort': ariaSortFor(column.sortField, sort) })}
    >
      {column.sortField === undefined ? (
        <span className={column.headerHidden === true ? 'sr-only' : undefined}>
          {column.header}
        </span>
      ) : (
        <SortableHeader
          label={column.header}
          field={column.sortField}
          sort={sort}
          onSort={onSort}
        />
      )}
      {editing && editable?.required === true ? (
        <span aria-hidden="true" className="text-destructive ms-1">
          {REQUIRED_MARK}
        </span>
      ) : null}
    </TableHead>
  );
}

/** A new row's Remove, a row's Edit or Undo, or the feature's own actions need the column. */
function needsActions<Row>(
  config: EditableConfig<Row>,
  rowActions: ((row: Row) => readonly RowAction[]) | undefined,
): boolean {
  return (
    rowActions !== undefined ||
    config.mode === 'rows' ||
    (config.canAdd && config.blankDraft !== undefined)
  );
}

export interface EditableTableProps<Row> {
  /** The editable form's id (`EditableFlow`'s), the prefix of every cell id. */
  readonly formId: string;
  readonly rows: readonly Row[];
  readonly config: EditableConfig<Row>;
  readonly state: EditableRowsState;
  readonly dispatch: (action: EditableRowsAction) => void;
  /** The shown list columns, in table order; those named by `config.columns` are editable. */
  readonly columns: readonly EditableTableColumn<Row>[];
  readonly recordName: (row: Row) => string;
  readonly rowHref: (row: Row) => string;
  readonly rowActions: ((row: Row) => readonly RowAction[]) | undefined;
  readonly selection: EditableSelection | null;
  readonly sort: string | null;
  readonly onSort: (next: string | null) => void;
  readonly busy: boolean;
  readonly onOpen: (row: Row) => void;
}

/**
 * The table of `ListPageTemplate`'s editable mode (K6, UI-SPEC § Editable table): new rows at the
 * top ("New" in the first cell, Remove new row, then "Add another row" under them), then the page's
 * rows. Rows mode: the kit's Edit turns a row's editable cells into 32px inputs in place (the muted
 * fill and Undo while in edit; several rows at once); Enter inside an input submits the form, which
 * opens the save summary. Grid mode (D-26): the editable cells are always inputs; Enter and
 * Shift+Enter move to the same column on the next and previous row; Esc restores the value read.
 * Add-only: existing rows stay read-only. A stale row carries the 16px triangle and "Changed by
 * someone else" in its first cell (L-08). Every value renders as React text (T-4.2-43). No effect:
 * the state is `useEditableRows`, held by the template. A `date` column is a native date input
 * (K15, 04.6); `CellInput` is exported so the document lines editor (K14) reuses these cells.
 */
export function EditableTable<Row>({
  formId,
  rows,
  config,
  state,
  dispatch,
  columns,
  recordName,
  rowHref,
  rowActions,
  selection,
  sort,
  onSort,
  busy,
  onOpen,
}: EditableTableProps<Row>): ReactElement {
  const t = useTranslations('common');
  const grid = config.mode === 'grid';
  const editables = new Map(config.columns.map((column) => [column.id, column]));
  const blankDraft = config.canAdd ? config.blankDraft : undefined;
  const hasActions = needsActions(config, rowActions);
  const pins = pinnedColumns(columns, editables, config, hasActions);
  const focusColumn = columns.find((column) => editables.has(column.id))?.id;

  function newModel(key: string, draft: Draft): RowModel<Row> {
    const name = config.rowName(draft);
    return {
      key,
      row: null,
      name: name === '' ? t('row_new') : name,
      original: null,
      draft,
      inputs: true,
      edited: false,
      stale: false,
      errors: state.errors.get(key) ?? NO_ERRORS,
    };
  }

  function rowModel(row: Row): RowModel<Row> {
    const key = config.rowId(row);
    const edit = state.edited.get(key);
    const original = edit?.original ?? config.toDraft(row);
    return {
      key,
      row,
      name: recordName(row),
      original,
      draft: edit?.draft ?? original,
      inputs: config.canEdit && config.addOnly !== true && (grid || edit !== undefined),
      edited: edit !== undefined,
      stale: state.stale.has(key),
      errors: state.errors.get(key) ?? NO_ERRORS,
    };
  }

  const added = state.added.map(({ key, draft }) => newModel(key, draft));
  const existing = rows.map((row) => rowModel(row));
  const keys = [...added, ...existing].map((model) => model.key);
  const editing = [...added, ...existing].some((model) => model.inputs);

  function change(model: RowModel<Row>, field: string, value: DraftValue): void {
    if (model.row !== null && model.original !== null && !state.edited.has(model.key)) {
      dispatch({
        type: 'edit',
        id: model.key,
        etag: config.etagOf(model.row),
        original: model.original,
      });
    }
    dispatch({ type: 'change', key: model.key, field, value });
  }

  /** Esc in the grid: the value read comes back. */
  function restoreCell(model: RowModel<Row>, field: string): void {
    if (model.original === null) return;
    dispatch({ type: 'change', key: model.key, field, value: model.original[field] ?? '' });
  }

  /** Enter and Shift+Enter in the grid: the same column on the next or previous row. */
  function moveFocus(key: string, field: string, step: number): void {
    const next = keys[keys.indexOf(key) + step];
    if (next !== undefined) document.getElementById(editableCellId(formId, next, field))?.focus();
  }

  function keyDown(
    model: RowModel<Row>,
    field: string,
    event: KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key === 'Escape' && grid) {
      restoreCell(model, field);
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    // Rows mode: Enter opens the summary through the form's own submit.
    if (grid) moveFocus(model.key, field, event.shiftKey ? -1 : 1);
    else event.currentTarget.form?.requestSubmit();
  }

  const renderRow = (model: RowModel<Row>): ReactElement => (
    <EditableRow
      key={model.key}
      formId={formId}
      model={model}
      columns={columns}
      editables={editables}
      focusColumn={focusColumn}
      selection={selection}
      grid={grid}
      pins={pins}
      rowHref={rowHref}
      onOpen={onOpen}
      onChange={(field, value) => {
        change(model, field, value);
      }}
      onKeyDown={(field, event) => {
        keyDown(model, field, event);
      }}
      actions={
        hasActions ? (
          <RowActionsCell
            model={model}
            config={config}
            rowActions={rowActions}
            dispatch={dispatch}
          />
        ) : undefined
      }
    />
  );

  const span = columns.length + Number(selection !== null) + Number(hasActions);
  return (
    // Without the sticky actions, the frame's inline end fades while more of the table is that way.
    <div className={hasActions ? undefined : FRAME_FADE}>
      <Table
        data-testid="editable-table"
        aria-busy={busy}
        // The grid is a dense editing surface: half the gutters keep its value columns in view.
        className={grid ? '[&_td]:px-2 [&_th]:px-2' : undefined}
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selection === null ? null : (
              <TableHead className="bg-muted h-10 w-10 px-4">
                <Checkbox
                  className={INDETERMINATE}
                  aria-label={t('select_all_on_page')}
                  checked={selection.page}
                  onCheckedChange={(next) => {
                    selection.togglePage(next === true);
                  }}
                />
              </TableHead>
            )}
            {columns.map((column) => (
              <EditableHead
                key={column.id}
                column={column}
                editable={editables.get(column.id)}
                pins={pins}
                editing={editing}
                sort={sort}
                onSort={onSort}
              />
            ))}
            {hasActions ? (
              <TableHead
                className={cn(
                  'bg-muted h-10 px-4 text-end',
                  STICKY_ACTIONS_HEAD,
                  pins.size > 0 && FIXED_ACTIONS,
                )}
              >
                <span className="sr-only">{t('actions')}</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {added.map(renderRow)}
          {added.length > 0 && blankDraft !== undefined ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={span} className="px-4 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    dispatch({ type: 'add', draft: blankDraft() });
                  }}
                >
                  <Icon name="plus" />
                  {t('add_another_row')}
                </Button>
              </TableCell>
            </TableRow>
          ) : null}
          {existing.map(renderRow)}
        </TableBody>
      </Table>
    </div>
  );
}

function draftOf(state: EditableRowsState, key: string): Draft {
  return (
    state.edited.get(key)?.draft ?? state.added.find((row) => row.key === key)?.draft ?? NO_DRAFT
  );
}

/** The drafts a save would send, each checked by the feature's validator; no request on a failure. */
function validateRows<Row>(
  state: EditableRowsState,
  config: EditableConfig<Row>,
): EditableRowsState['errors'] {
  const errors = new Map<string, Readonly<Record<string, string>>>();
  const validate = config.validate;
  if (validate === undefined) return errors;
  for (const key of toBatch(state).keys) {
    const found = validate(draftOf(state, key));
    if (Object.keys(found).length > 0) errors.set(key, found);
  }
  return errors;
}

interface SummaryWords {
  readonly t: ReturnType<typeof useTranslations<'common'>>;
  readonly f: ReturnType<typeof useFormat>;
}

/** A choice's label, or the value itself for a free-text column. */
function optionLabel(column: EditableColumn, value: string): string {
  return column.options?.find((option) => option.value === value)?.label ?? value;
}

/** A cell value as the summary reads it: Yes or No, option labels, or "None" for nothing. */
function valueText(
  column: EditableColumn,
  value: DraftValue | undefined,
  { t, f }: SummaryWords,
): string {
  if (typeof value === 'boolean') return t(value ? 'is_active_export' : 'is_not_active_export');
  const values = typeof value === 'object' ? value : [asText(value)];
  const labels = values.filter((one) => one !== '').map((one) => optionLabel(column, one));
  return labels.length === 0 ? t('none') : f.list(labels);
}

/** One edited row's lines, in column order: "{row}: {column}: {old} → {new}", "… updated" for a note. */
function rowLines(
  name: string,
  row: EditedRow,
  columns: readonly EditableColumn[],
  words: SummaryWords,
): SummaryChange[] {
  return columns
    .filter((column) => !sameDraftValue(row.original[column.id], row.draft[column.id]))
    .map((column): SummaryChange => {
      const label = words.t('row_column', { row: name, column: column.label });
      return column.kind === 'textarea'
        ? { type: 'updated', label }
        : {
            type: 'changed',
            label,
            from: valueText(column, row.original[column.id], words),
            to: valueText(column, row.draft[column.id], words),
          };
    });
}

/** The save bar's count and the summary's title: the feature's, else the kit's (K11 labels). */
function flowLabels<Row>(
  config: EditableConfig<Row>,
  dirty: number,
  { t, f }: SummaryWords,
): { readonly count: string; readonly title: string } {
  return {
    count:
      config.labels.countLabel?.(dirty) ??
      t('rows_changed', { count: dirty, countN: f.number(dirty) }),
    title:
      config.labels.summaryTitle?.(dirty) ??
      t('save_list_summary_title', { list: config.labels.listLabel }),
  };
}

/** The flow's dialog and alert; a failure carries what its message needs. */
interface Flow {
  readonly summary: boolean;
  readonly retrying: boolean;
  readonly failure: { readonly code: string; readonly retryAfterS: number | null } | null;
}
const IDLE_FLOW: Flow = { summary: false, retrying: false, failure: null };

/** A view change held behind "Discard changes?". */
export interface HeldAction {
  readonly run: () => void;
}

export interface EditableFlowProps<Row> {
  /** The `<form>` the save bar submits; the table's cell ids start with it. */
  readonly formId: string;
  readonly config: EditableConfig<Row>;
  readonly rows: readonly Row[];
  readonly recordName: (row: Row) => string;
  readonly state: EditableRowsState;
  readonly dispatch: (action: EditableRowsAction) => void;
  readonly dirty: number;
  /** A view change waiting behind "Discard changes?" (the template's pager, sort, search, filters). */
  readonly held: HeldAction | null;
  readonly onHold: (held: HeldAction | null) => void;
  /** Reads the list again (after a save, or "Reload list"). */
  readonly revalidate: () => void;
  readonly featureErrors?: FeatureErrorCodes | undefined;
  /** The table and the pager. */
  readonly children: ReactNode;
}

/** The stale alert (D-14, L-08): how many rows someone else changed, their names, and Reload list. */
function StaleAlert({
  names,
  onReload,
}: {
  readonly names: readonly string[];
  readonly onReload: () => void;
}): ReactElement {
  const t = useTranslations('common');
  const f = useFormat();
  return (
    <Alert variant="destructive" data-testid="editable-stale">
      <Icon name="triangle-exclamation" />
      <AlertTitle className="font-semibold">
        {t('rows_stale', { count: names.length, countN: f.number(names.length) })}
      </AlertTitle>
      <AlertDescription className="text-destructive flex flex-col items-start gap-2">
        <ul className="list-disc ps-4">
          {names.map((name, index) => (
            <li key={index}>{name}</li>
          ))}
        </ul>
        <Button type="button" variant="outline" className="text-foreground" onClick={onReload}>
          {t('reload_list')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** A save that failed for a network or server reason (Retry), or a refusal a retry met (no Retry). */
function FailureAlert({
  message,
  retryable,
  retrying,
  onRetry,
}: {
  readonly message: string;
  readonly retryable: boolean;
  readonly retrying: boolean;
  readonly onRetry: () => void;
}): ReactElement {
  const t = useTranslations('common');
  return (
    <Alert variant="destructive" data-testid="editable-save-failed">
      <Icon name="circle-exclamation" />
      <AlertTitle className="font-semibold">{t('save_failed')}</AlertTitle>
      <AlertDescription className="text-destructive flex flex-col items-start gap-2">
        <span>{message}</span>
        {retryable ? (
          <Button
            type="button"
            variant="outline"
            className="text-foreground"
            disabled={retrying}
            onClick={onRetry}
          >
            {t('retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/**
 * The save flow of the editable mode: client validation, one summary (kind 4, ten lines then "Show
 * {n} more"), one batch request (ADR-0040's wire through `toBatch`), and where each answer shows
 * (UI-SPEC § Editable table, L-08):
 *
 * - **2xx:** the toast, the edits cleared, the list read again.
 * - **400:** the summary closes; each failing cell gets `aria-invalid` and its message, and "Check
 *   these fields" above the table (focused) links "{row}: {column}".
 * - **412 `ERP-CORE-0013`:** nothing is cleared (all or nothing); the stale rows are marked and the
 *   alert offers "Reload list"; the summary shows the feature's `errors.ERP-CORE-0013` with Confirm
 *   disabled.
 * - **Network or 5xx:** the summary closes into the kit alert with Retry; every edit is kept.
 *
 * Leaving: the save bar's "Discard changes", "Reload list", the template's held view change and any
 * in-app link (`useUnsavedChanges`) go through one "Discard changes?"; reload and tab close get the
 * browser's prompt. D-39: no alert before a save has answered.
 */
export function EditableFlow<Row>({
  formId,
  config,
  rows,
  recordName,
  state,
  dispatch,
  dirty,
  held,
  onHold,
  revalidate,
  featureErrors,
  children,
}: EditableFlowProps<Row>): ReactElement {
  const t = useTranslations('common');
  const f = useFormat();
  const errorText = useErrorText(featureErrors);
  const copy = useConfirmCopy();
  const guard = useUnsavedChanges(dirty > 0);
  const [flow, setFlow] = useState<Flow>(IDLE_FLOW);
  const summaryNode = useRef<HTMLDivElement>(null);

  const nameById = new Map(rows.map((row) => [config.rowId(row), recordName(row)]));
  const nameOf = (key: string): string => {
    const known = nameById.get(key);
    if (known !== undefined) return known;
    const name = config.rowName(draftOf(state, key));
    return name === '' ? t('row_new') : name;
  };
  const labelOf = (field: string): string =>
    config.columns.find((column) => column.id === field)?.label ?? field;
  const itemsOf = (key: string, fields: Readonly<Record<string, string>>): ErrorSummaryItem[] =>
    Object.entries(fields).map(([field, message]) => ({
      fieldId: editableCellId(formId, key, field),
      label: t('row_column', { row: nameOf(key), column: labelOf(field) }),
      message,
    }));
  const items = [...state.errors].flatMap(([key, fields]) => itemsOf(key, fields));
  const staleNames = rows
    .filter((row) => state.stale.has(config.rowId(row)))
    .map((row) => recordName(row));

  function saved(): void {
    toast.success(config.labels.savedToast, { duration: CLIENT_TIMINGS.toast.durationMs });
    dispatch({ type: 'reset' });
    setFlow(IDLE_FLOW);
    revalidate();
  }

  /** A 400's cells: the summary closes and focus moves to "Check these fields" (D-29). */
  function refusedCells(errors: EditableRowsState['errors']): ConfirmOutcome {
    flushSync(() => {
      setFlow(IDLE_FLOW);
      dispatch({ type: 'setErrors', errors });
    });
    summaryNode.current?.focus();
    return OK;
  }

  /** Where an answer shows; `{ ok: true }` tells the summary its part is done. */
  function settle(result: EditableSaveResult, keys: readonly string[]): ConfirmOutcome {
    if (result.ok) {
      saved();
      return OK;
    }
    if (result.code === STALE_CODE) {
      dispatch({ type: 'markStale', ids: staleIdsFromIssues(result.issues) });
      return result;
    }
    const cells =
      result.code === VALIDATION_CODE
        ? errorsFromIssues(result.issues, keys, config.issueText)
        : NO_CELLS;
    if (cells.size > 0) return refusedCells(cells);
    if (!isRetryableCode(result.code)) return result;
    setFlow({ summary: false, retrying: false, failure: result });
    return OK;
  }

  async function send(): Promise<ConfirmOutcome> {
    const batch = toBatch(state);
    return settle(await config.save({ rows: batch.rows }), batch.keys);
  }

  async function retry(): Promise<void> {
    setFlow({ ...flow, retrying: true });
    const outcome = await send();
    if (!outcome.ok) setFlow({ summary: false, retrying: false, failure: outcome });
  }

  function startSave(): void {
    const errors = validateRows(state, config);
    flushSync(() => {
      dispatch({ type: 'setErrors', errors });
    });
    if (errors.size > 0) {
      summaryNode.current?.focus();
      return;
    }
    setFlow({ summary: true, retrying: false, failure: null });
  }

  function discard(): ConfirmOutcome {
    const run = held?.run;
    dispatch({ type: 'reset' });
    setFlow(IDLE_FLOW);
    onHold(null);
    if (guard.pendingHref !== null) guard.confirmLeave();
    run?.();
    return OK;
  }

  const words: SummaryWords = { t, f };
  const labels = flowLabels(config, dirty, words);
  const leaving = held !== null || guard.pendingHref !== null;
  const lines: SummaryChange[] = flow.summary
    ? [
        ...[...state.added].reverse().map((row): SummaryChange => ({
          type: 'text',
          text: t('summary_added', { name: nameOf(row.key) }),
        })),
        ...[...state.edited].flatMap(([id, row]) =>
          rowLines(nameOf(id), row, config.columns, words),
        ),
      ]
    : [];
  const failure = flow.failure;

  return (
    <div className="flex flex-col gap-4">
      {staleNames.length > 0 ? (
        <StaleAlert
          names={staleNames}
          onReload={() => {
            onHold({ run: revalidate });
          }}
        />
      ) : null}
      {failure === null ? null : (
        <FailureAlert
          message={errorText(failure)}
          retryable={isRetryableCode(failure.code)}
          retrying={flow.retrying}
          onRetry={() => {
            void retry();
          }}
        />
      )}
      {items.length === 0 ? null : (
        <ErrorSummary
          ref={summaryNode}
          items={items}
          onSelect={(fieldId) => {
            document.getElementById(fieldId)?.focus();
          }}
        />
      )}
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          startSave();
        }}
      >
        {children}
        {dirty > 0 ? (
          <SaveBar
            formId={formId}
            dirty
            submitLabel={config.labels.submit}
            pendingLabel={config.labels.pending}
            isPending={flow.retrying}
            backLabel={t('discard_changes')}
            countLabel={labels.count}
            onBack={() => {
              onHold({ run: () => undefined });
            }}
          />
        ) : null}
      </form>
      <ConfirmDialog
        kind="summary"
        open={flow.summary}
        onOpenChange={(open) => {
          if (!open) setFlow((current) => ({ ...current, summary: false }));
        }}
        title={labels.title}
        {...(config.labels.summaryBody === undefined ? {} : { body: config.labels.summaryBody })}
        changes={lines}
        visibleChanges={SUMMARY_LINES}
        dismissLabel={t('keep_editing')}
        confirmLabel={config.labels.submit}
        pendingLabel={config.labels.pending}
        featureErrors={featureErrors}
        onConfirm={send}
      />
      <ConfirmDialog
        kind="discard"
        open={leaving}
        onOpenChange={(open) => {
          if (open) return;
          guard.cancelLeave();
          onHold(null);
        }}
        {...copy.discard({ recordName: config.labels.listLabel })}
        onConfirm={discard}
      />
    </div>
  );
}

/**
 * "Set for selected" (grid mode, `bulkSet`): a small dialog with the chosen columns; "Apply to
 * {count} items" fills those cells of the checked rows (they become dirty) and saves nothing until
 * the save bar. An empty input leaves the cell unchanged.
 */
export function BulkSetButton<Row>({
  config,
  rows,
  dispatch,
}: {
  readonly config: EditableConfig<Row>;
  readonly rows: readonly Row[];
  readonly dispatch: (action: EditableRowsAction) => void;
}): ReactElement | null {
  const t = useTranslations('common');
  const baseId = useId();
  const [values, setValues] = useState<Readonly<Record<string, string>> | null>(null);
  const bulk = config.bulkSet;
  if (bulk === undefined) return null;
  const fields = config.columns.filter((column) => bulk.columns.includes(column.id));
  const formId = `${baseId}-form`;

  const apply = (): void => {
    dispatch({
      type: 'applyToRows',
      ids: rows.map((row) => config.rowId(row)),
      patch: values ?? {},
      originals: new Map(
        rows.map((row) => [
          config.rowId(row),
          { etag: config.etagOf(row), original: config.toDraft(row) },
        ]),
      ),
    });
    setValues(null);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => {
          setValues({});
        }}
      >
        {bulk.label}
      </Button>
      <Dialog
        open={values !== null}
        onOpenChange={(open) => {
          if (!open) setValues(null);
        }}
      >
        {/* No X: the primitive's sr-only "Close" is hard-coded English (FE-19); the dismiss names it. */}
        <DialogContent showCloseButton={false} aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{bulk.title}</DialogTitle>
          </DialogHeader>
          <form
            id={formId}
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
          >
            {fields.map((column) => (
              <div key={column.id} className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-${column.id}`}>{column.label}</Label>
                <Input
                  id={`${baseId}-${column.id}`}
                  type="text"
                  autoComplete="off"
                  inputMode={column.kind === 'number' ? 'decimal' : undefined}
                  className={column.kind === 'number' ? 'text-end tabular-nums' : undefined}
                  value={values?.[column.id] ?? ''}
                  onChange={(event) => {
                    setValues({ ...values, [column.id]: event.target.value });
                  }}
                />
              </div>
            ))}
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setValues(null);
              }}
            >
              {t('back_to_list')}
            </Button>
            <Button type="submit" form={formId}>
              {bulk.applyLabel(rows.length)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
