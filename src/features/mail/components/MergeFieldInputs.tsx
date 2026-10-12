'use client';

import { useRef, type ReactElement } from 'react';
import { LabelText } from '@/components/molecules/ChoiceField';
import { FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { InsertMergeField, type MergeField } from '@/features/mail/components/InsertMergeField';
import { direction } from '@/i18n/direction';
import { toSupportedLocale } from '@/i18n/locales';

/** What both controls take: a `SchemaForm` custom field's ids and state, the value, the version's locale. */
export interface MergeFieldControlProps {
  readonly id: string;
  /** The full label, "Subject (Arabic)": it also names the Insert merge field button. */
  readonly label: string;
  readonly describedBy?: string;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** Focusing the field selects its version's language in the preview (UI-SPEC § Preview). */
  readonly onFocus?: () => void;
  /** The version's locale: `dir` and `lang` come from it, never from the interface. */
  readonly locale: string;
  readonly fields: readonly MergeField[];
  readonly required?: boolean;
}

/**
 * The text direction and language of a version's wording (04.3 UI-SPEC § RTL and mobile): the
 * version's, whatever the interface's, so an Arabic message is typed right to left in an English
 * screen and an English one left to right in an Arabic screen. This is the CONTENT's direction;
 * the layout's stays the one `app/layout.tsx` sets (FE-20). A locale this build has no
 * direction for reads left to right.
 */
function wordingDirection(locale: string): { readonly dir: 'ltr' | 'rtl'; readonly lang: string } {
  return { dir: direction(toSupportedLocale(locale)), lang: locale };
}

/** The label row: the label (and the required mark) at the start, Insert merge field at the end. */
function LabelRow({
  props,
  target,
}: {
  readonly props: MergeFieldControlProps;
  readonly target: () => HTMLInputElement | HTMLTextAreaElement | null;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-end justify-between gap-1">
      <FieldLabel htmlFor={props.id}>
        <LabelText label={props.label} required={props.required === true} />
      </FieldLabel>
      {/* At the inline end even when the row wraps (375): the button stays where it is looked for. */}
      <div className="ms-auto">
        <InsertMergeField
          fieldLabel={props.label}
          fields={props.fields}
          target={target}
          onInsert={props.onChange}
          disabled={props.disabled}
        />
      </div>
    </div>
  );
}

/** The ARIA a control shares: invalid, required, and the ids that describe it. */
function ariaOf(props: MergeFieldControlProps, extra?: string) {
  const describedBy = [extra, props.describedBy].filter(
    (part) => part !== undefined && part !== '',
  );
  return {
    'aria-invalid': props.invalid,
    'aria-required': props.required === true || undefined,
    'aria-describedby': describedBy.length === 0 ? undefined : describedBy.join(' '),
  };
}

/**
 * A version's subject (UI-SPEC § Sections 2 to n): a 32px input in the version's direction, its own
 * label on `id` (a `SchemaForm` custom field renders its label) and Insert merge field at the end
 * of the label row. Text only: the wording is never rendered as markup (T-4.3-02).
 */
export function MergeFieldInput(props: MergeFieldControlProps): ReactElement {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <LabelRow props={props} target={() => ref.current} />
      <Input
        ref={ref}
        id={props.id}
        type="text"
        autoComplete="off"
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        onFocus={props.onFocus}
        dir={wordingDirection(props.locale).dir}
        lang={wordingDirection(props.locale).lang}
        {...ariaOf(props)}
      />
    </div>
  );
}

/**
 * A version's email message: a textarea of at least 12 rows (256px), resized vertically only, in
 * the version's direction, with its helper under it ("Plain text. A blank line starts a new
 * paragraph...") and Insert merge field at the end of the label row.
 */
export function MergeFieldTextarea(
  props: MergeFieldControlProps & { readonly helper: string },
): ReactElement {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const helperId = `${props.id}-message-helper`;
  return (
    <div className="flex flex-col gap-1">
      <LabelRow props={props} target={() => ref.current} />
      <Textarea
        ref={ref}
        id={props.id}
        autoComplete="off"
        className="min-h-64 resize-y"
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        onFocus={props.onFocus}
        dir={wordingDirection(props.locale).dir}
        lang={wordingDirection(props.locale).lang}
        {...ariaOf(props, helperId)}
      />
      <FieldDescription id={helperId} className="text-xs">
        {props.helper}
      </FieldDescription>
    </div>
  );
}
