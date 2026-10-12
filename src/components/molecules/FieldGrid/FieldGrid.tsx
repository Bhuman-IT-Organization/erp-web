import type { ReactElement, ReactNode } from 'react';
import { choiceSpan, type ChoiceOption } from '@/components/molecules/ChoiceField';

/**
 * What a form field is. Declared here, not in `SchemaForm`, because `fieldSpan` needs it and a
 * molecule may not import an organism (FE-06); `SchemaForm` re-exports it.
 */
export type FieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'amount'
  | 'date'
  | 'password'
  | 'textarea'
  | 'choice'
  | 'checkbox'
  | 'color'
  | 'custom';

export type FieldSpan = 'short' | 'full';

/**
 * The field's width, from its kind — never the screen's choice (UI-SPEC § FieldGrid, D-01).
 * text, e-mail, phone, number, amount, date, password, a single checkbox and a color are short; a textarea
 * and a custom field are full width; a choice delegates to `choiceSpan` (a radio group of 4-6 and
 * any multiple choice are full, and a single choice still loading reserves the full width).
 */
export function fieldSpan(
  kind: FieldKind,
  options?: readonly ChoiceOption[],
  multiple = false,
): FieldSpan {
  if (kind === 'choice') return choiceSpan(options, multiple);
  return kind === 'textarea' || kind === 'custom' ? 'full' : 'short';
}

export interface FieldGridItem {
  readonly key: string;
  readonly span: FieldSpan;
  readonly node: ReactNode;
}

export interface FieldGridProps {
  readonly items: readonly FieldGridItem[];
  /**
   * Opt-in (lead 2026-10-07): the fields of a row align to its bottom, so two short inputs line up
   * when one label wraps. A field that should sit alone (a checkbox) is declared `span: 'full'`.
   * ponytail: aligns the field boxes, so a helper of a different line count (or an error under one)
   * still offsets the inputs; reach for a subgrid per field if a screen needs that.
   */
  readonly alignInputs?: boolean;
}

/**
 * The form's grid: one column below `md`; from `md`, two columns with a 24 px column gap and a
 * 16 px row gap, where a short field takes one column and a full one spans both. `min-w-0` lets a
 * long value truncate inside its cell instead of widening the column.
 */
export function FieldGrid({ items, alignInputs = false }: FieldGridProps): ReactElement {
  return (
    <div
      className={`grid grid-cols-1 gap-y-4 md:grid-cols-2 md:gap-x-6${alignInputs ? ' md:items-end' : ''}`}
    >
      {items.map((item) => (
        <div
          key={item.key}
          data-field={item.key}
          className={item.span === 'full' ? 'min-w-0 md:col-span-2' : 'min-w-0'}
        >
          {item.node}
        </div>
      ))}
    </div>
  );
}
