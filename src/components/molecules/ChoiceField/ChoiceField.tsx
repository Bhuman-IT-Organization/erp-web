'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { FieldBlocksSkeleton } from '@/components/molecules/FieldBlocksSkeleton';
import { SearchableMultiSelect } from '@/components/molecules/SearchableMultiSelect';
import {
  SearchableSelect,
  type ChoiceOption,
  type EmptyHint,
} from '@/components/molecules/SearchableSelect';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export type { ChoiceOption, EmptyHint };

/** Inclusive: 6 or fewer options are visible controls, 7 or more are searchable (UI-SPEC choice 18). */
export const CHOICE_SEARCH_THRESHOLD = 6;
/** Radios sit on one row only when there are this many or fewer … */
const INLINE_MAX_OPTIONS = 3;
/** … and every label is this many characters or fewer (UI-SPEC § Control selection). */
const INLINE_MAX_LABEL = 16;
const REQUIRED_MARK = '*';

/**
 * The field's width in `FieldGrid` (UI-SPEC § FieldGrid): a radio group of 3 or fewer and a single
 * searchable select are short; a radio group of 4-6, a checkbox group and a multi-select (its chips
 * need room) are full width. While the options load, the field reserves the full width, so a
 * radio group of 4-6 does not push the grid around when it arrives (lead decision 2026-09-26).
 */
export function choiceSpan(
  options: readonly ChoiceOption[] | undefined,
  multiple: boolean,
): 'short' | 'full' {
  if (multiple || options === undefined) return 'full';
  const radios = options.length <= CHOICE_SEARCH_THRESHOLD;
  return radios && options.length > INLINE_MAX_OPTIONS ? 'full' : 'short';
}

/** Past the threshold, or empty with a hint to show: the searchable control. */
const isSearchable = (options: readonly ChoiceOption[], emptyHint: EmptyHint | undefined) =>
  options.length > CHOICE_SEARCH_THRESHOLD || (options.length === 0 && emptyHint !== undefined);

export type ChoiceFieldProps = {
  readonly id: string;
  /** Already translated (FE-01). A `<legend>` for a radio or checkbox group, a `<label>` for a select. */
  readonly label: string;
  /** `undefined` while the options are still loading: a skeleton, never a guess at the control. */
  readonly options: readonly ChoiceOption[] | undefined;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  /**
   * "None yet, create one": with zero loaded options the field is the searchable select, whose
   * open list reads this hint and its link (an empty radio group would show nothing at all).
   */
  readonly emptyHint?: EmptyHint;
} & (
  | {
      readonly multiple: false;
      readonly value: string | null;
      readonly onChange: (value: string | null) => void;
    }
  | {
      readonly multiple: true;
      readonly value: readonly string[];
      readonly onChange: (value: string[]) => void;
    }
);

/**
 * A label with the kit's required mark: an `aria-hidden` red asterisk 4 px after the text.
 * `hiddenRequired` adds a visually hidden "(required)" for a control that cannot carry
 * `aria-required`: a checkbox group's `<fieldset>` has role `group`, where ARIA forbids it, so the
 * group's NAME says it instead (lead decision 2026-09-26). `SchemaForm` labels its fields with it too.
 */
export function LabelText({
  label,
  required,
  hiddenRequired,
}: {
  readonly label: string;
  readonly required: boolean;
  readonly hiddenRequired?: string | undefined;
}): ReactElement {
  return (
    <span>
      {label}
      {required ? (
        <span aria-hidden="true" className="text-destructive ms-1">
          {REQUIRED_MARK}
        </span>
      ) : null}
      {required && hiddenRequired !== undefined ? (
        <span className="sr-only"> {hiddenRequired}</span>
      ) : null}
    </span>
  );
}

/**
 * The kit, not the screen, picks the control from the field's shape (D-24). The lead's rule:
 * "single option should be radio button, multiple option should be checklist" — and past 6 options
 * a list of controls stops being scannable, so it becomes searchable:
 *
 * - one choice of 6 or fewer → radio buttons, all visible (one row only for 3 or fewer short labels);
 * - one choice of 7 or more → `SearchableSelect`, exactly one value;
 * - several of 6 or fewer → a checkbox group in a `<fieldset>`/`<legend>`;
 * - several of 7 or more → `SearchableMultiSelect`, the picks as removable chips;
 * - none at all, with an `emptyHint` → the searchable control, its open list reading the hint.
 *
 * A single yes/no setting is a plain checkbox that applies on Save; a switch is never used in a
 * form, because it reads as "takes effect now" (D-24). While `options` is `undefined` the field is
 * one labelled field-block skeleton, so it never renders radios that turn into a select (D-39).
 * The required mark is an `aria-hidden` asterisk; assistive technology hears `aria-required`.
 */
export function ChoiceField(props: ChoiceFieldProps): ReactElement {
  const t = useTranslations('common');
  const { id, label, options, required = false, disabled, invalid, describedBy, emptyHint } = props;

  if (options === undefined) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('loading')}</span>
        <FieldBlocksSkeleton count={1} />
      </div>
    );
  }

  const text = <LabelText label={label} required={required} />;

  if (isSearchable(options, emptyHint)) {
    const field = { id, options, required, disabled, invalid, describedBy, emptyHint };
    return (
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={id}>{text}</FieldLabel>
        {props.multiple ? (
          <SearchableMultiSelect {...field} value={props.value} onChange={props.onChange} />
        ) : (
          <SearchableSelect {...field} value={props.value} onChange={props.onChange} />
        )}
      </div>
    );
  }

  if (props.multiple) {
    const { value, onChange } = props;
    return (
      <FieldSet id={id} aria-invalid={invalid} aria-describedby={describedBy} className="gap-1">
        <FieldLegend variant="label">
          <LabelText label={label} required={required} hiddenRequired={t('required_hidden')} />
        </FieldLegend>
        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <Label key={option.value} className="font-normal">
              <Checkbox
                checked={value.includes(option.value)}
                aria-invalid={invalid}
                disabled={disabled}
                onCheckedChange={(next) => {
                  onChange(
                    next === true
                      ? [...value, option.value]
                      : value.filter((kept) => kept !== option.value),
                  );
                }}
              />
              {option.label}
            </Label>
          ))}
        </div>
      </FieldSet>
    );
  }

  const { value, onChange } = props;
  const legendId = `${id}-legend`;
  const inline =
    options.length <= INLINE_MAX_OPTIONS &&
    options.every((option) => option.label.length <= INLINE_MAX_LABEL);
  return (
    <FieldSet className="gap-1">
      <FieldLegend id={legendId} variant="label">
        {text}
      </FieldLegend>
      <RadioGroup
        id={id}
        aria-labelledby={legendId}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        required={required}
        disabled={disabled}
        value={value ?? ''}
        onValueChange={onChange}
        className={inline ? 'flex flex-row flex-wrap gap-4' : 'flex flex-col gap-2'}
      >
        {options.map((option) => (
          <Label key={option.value} className="font-normal">
            <RadioGroupItem value={option.value} aria-invalid={invalid} />
            {option.label}
          </Label>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}
