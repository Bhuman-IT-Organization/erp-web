'use client';

import { useTranslations } from 'next-intl';
import { Fragment, useRef, type ChangeEvent, type ReactElement, type ReactNode } from 'react';
import {
  Controller,
  useFormState,
  useWatch,
  type Control,
  type ControllerRenderProps,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';
import { Icon } from '@/components/atoms/Icon';
import {
  ChoiceField,
  LabelText,
  type ChoiceOption,
  type EmptyHint,
} from '@/components/molecules/ChoiceField';
import {
  FieldGrid,
  fieldSpan,
  type FieldKind,
  type FieldSpan,
} from '@/components/molecules/FieldGrid';
import { PasswordField } from '@/components/molecules/PasswordField';
import { DisclosureSection } from '@/components/organisms/DisclosureSection';
import { ErrorSummary, type ErrorSummaryItem } from '@/components/organisms/ErrorSummary';
import { FormSection } from '@/components/organisms/FormSection';
import { SaveBar, type SecondarySubmit } from '@/components/organisms/SaveBar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type { FieldKind };

/** What a custom field's `render` receives besides the form field: the ids and state to wire. */
export interface CustomFieldState {
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly id: string;
  readonly describedBy: string;
}

export interface FieldSpec<T extends FieldValues> {
  readonly name: Path<T>;
  /** Already translated; also names the field in the error summary. */
  readonly label: string;
  readonly kind: FieldKind;
  readonly required?: boolean;
  readonly helper?: string;
  /** An example, never the label (UI-SPEC § Required marker). */
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /** kind 'choice': `undefined` while the options load (a skeleton, never a guessed control). */
  readonly options?: readonly ChoiceOption[] | undefined;
  readonly multiple?: boolean;
  /** kind 'choice': "none yet, create one" once `options` has loaded empty (`ChoiceField`). */
  readonly emptyHint?: EmptyHint;
  /**
   * The width, when the SCREEN knows it and the kit cannot: a lookup whose options load later
   * (Role, 21; Default Language) is declared `'short'`, so its cell never moves when they arrive
   * (lead decision (a), 2026-09-26). Absent → the kind decides (`fieldSpan`).
   */
  readonly span?: FieldSpan;
  /** kind 'custom' (full width): renders the control AND its own label, on `state.id`. */
  readonly render?: (
    field: ControllerRenderProps<T, Path<T>>,
    state: CustomFieldState,
  ) => ReactNode;
}

export interface FormSectionSpec<T extends FieldValues> {
  readonly id: string;
  readonly title: string;
  readonly fields: readonly FieldSpec<T>[];
  readonly disclosure?: { readonly title: string; readonly fields: readonly FieldSpec<T>[] };
  /** D-35: this section's data has not arrived; its heading is real, its fields are blocks. */
  readonly loading?: boolean;
  /** Rendered once at the top of the section, before its fields (UAT 12: the admin-only refusal). */
  readonly notice?: ReactNode;
  /** Read-only content after the fields (a members list, the "In Perfex" links). */
  readonly content?: ReactNode;
  /** Opt-in (lead 2026-10-07): a row's fields align to its bottom (`FieldGrid`'s `alignInputs`). */
  readonly alignInputs?: boolean;
}

export interface SchemaFormProps<T extends FieldValues> {
  readonly id: string;
  readonly form: UseFormReturn<T>;
  readonly sections: readonly FormSectionSpec<T>[];
  /**
   * After client validation; the screen opens its save summary (plan 11). `submitter` names the
   * pressed submit: the `secondarySubmit`'s name, else `null` (the primary).
   */
  readonly onValid: (values: T, meta: { readonly submitter: string | null }) => void;
  /** zod messages and server issues are message KEYS; the feature translates them (FE-12). */
  readonly translateError: (messageKey: string) => string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly isPending: boolean;
  readonly onBack: () => void;
  /** A save that failed for a server or network reason; `message` is already human (D-32). */
  readonly serverError?: { readonly message: string; readonly onRetry?: () => void } | null;
  /** Rendered once above the sections (e.g. the one admin-only Alert, UAT 12). */
  readonly notice?: ReactNode;
  readonly readOnly?: boolean;
  /** Opt-in, 04.6-14: the save bar's second submit; `onValid` hears its name when it was pressed. */
  readonly secondarySubmit?: SecondarySubmit;
  /**
   * Opt-in, 04.6-14: summary entries the specs cannot name (a lines grid's "Line {n}: {column}"),
   * after the fields' own, each linking to its control's id.
   */
  readonly extraErrors?: readonly ErrorSummaryItem[];
  /**
   * Opt-in, 04.7-22: the save bar's dismissal text when the form returns somewhere other than its
   * list ("Back to the record" on a record's edit); default "Back to list".
   */
  readonly backLabel?: string;
}

/** The save bar's opt-ins the form passes on, only those it was given. */
function saveBarOptions(
  secondarySubmit: SecondarySubmit | undefined,
  backLabel: string | undefined,
): { secondarySubmit?: SecondarySubmit; backLabel?: string } {
  return {
    ...(secondarySubmit === undefined ? {} : { secondarySubmit }),
    ...(backLabel === undefined ? {} : { backLabel }),
  };
}

/** The input type per plain kind; an amount is decimal text aligned to the end (numbers line up). */
const INPUTS = {
  text: { type: 'text' },
  email: { type: 'email' },
  tel: { type: 'tel' },
  number: { type: 'number' },
  date: { type: 'date' },
  amount: { type: 'text', inputMode: 'decimal', className: 'text-end tabular-nums' },
} as const;

const NO_EXTRA_ERRORS: readonly ErrorSummaryItem[] = [];

/** What a summary link may focus when the field's id is on a wrapper (a checkbox group's fieldset). */
const FOCUSABLE = 'input, textarea, select, button, [tabindex]';

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
const asOne = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const hasValue = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.length > 0
    : value !== undefined && value !== null && value !== '' && value !== false;

/** A value the color chip may paint: `#` and six hex digits, any case (anything else is text only). */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

interface ColorFieldProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly value: unknown;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
  readonly placeholder: string | undefined;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly describedBy: string | undefined;
  readonly after: ReactNode;
}

/**
 * The `color` kind (D-15, UI-SPEC 4.10 section 1): Perfex's `render_color_picker`, a text input
 * with a picker add-on. The TEXT input is the value and carries the field's id, label and
 * `aria-*`: any text up to the feature's cap is accepted with no format check (Perfex has none),
 * and blank is allowed and submits as `''`; clearing the text is going back to blank, so there is
 * no clear button. The inline-end add-on is a 24 px chip with a native `<input type="color">`
 * drawn transparent over it, named "Pick a color for {label}"; a pick replaces the text with the
 * lowercase `#rrggbb`. The two native-first precedents (`EditableTable`'s `ColorCell`, custom
 * fields' `ColorControl`) put the id on the native control and cannot return to blank, which is
 * why this kind leads with the text.
 *
 * A stored color is record data, never a token or a class: the chip is painted by an inline
 * `backgroundColor` only for a value matching `HEX_COLOR`; anything else (free text, markup)
 * shows the dashed "no color" chip and stays React text in the input. The native input needs a
 * value, so it is handed the text when valid and nothing otherwise (the browser then shows black);
 * that value is never submitted. Disabled or read-only disables both controls and dims the chip.
 * Under `ar` the add-on stays at the inline end and the value left-to-right (`dir="ltr"`).
 */
function ColorField({
  id,
  name,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  required,
  disabled,
  invalid,
  describedBy,
  after,
}: ColorFieldProps): ReactElement {
  const t = useTranslations('common');
  const text = asText(value);
  const paintable = HEX_COLOR.test(text);
  return (
    <Field data-invalid={invalid} className="gap-1">
      <FieldLabel htmlFor={id}>
        <LabelText label={label} required={required} />
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          name={name}
          type="text"
          dir="ltr"
          spellCheck={false}
          autoComplete="off"
          value={text}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-required={required || undefined}
          aria-describedby={describedBy}
        />
        <InputGroupAddon align="inline-end">
          <span
            data-slot="color-chip"
            data-state={paintable ? 'filled' : 'empty'}
            className={cn(
              'relative size-6 shrink-0 rounded-sm outline-1 -outline-offset-1 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
              paintable
                ? 'outline-solid outline-border'
                : 'bg-muted outline-dashed outline-muted-foreground',
              disabled ? 'opacity-50' : null,
            )}
            style={paintable ? { backgroundColor: text } : undefined}
          >
            <input
              type="color"
              aria-label={t('pick_color_named', { label })}
              value={paintable ? text.toLowerCase() : ''}
              disabled={disabled}
              className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              onClick={(event) => {
                // The add-on focuses the text input on a click; the picker keeps the focus instead.
                event.stopPropagation();
              }}
              onChange={(event) => {
                onChange(event.target.value.toLowerCase());
              }}
            />
          </span>
        </InputGroupAddon>
      </InputGroup>
      {after}
    </Field>
  );
}

/** Focus the control a summary link names; a wrapper id (fieldset) focuses its first control. */
function focusField(fieldId: string): void {
  const node = document.getElementById(fieldId);
  const target =
    node === null || node.matches(FOCUSABLE) ? node : node.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus();
}

interface SpecFieldProps<T extends FieldValues> {
  readonly spec: FieldSpec<T>;
  readonly control: Control<T>;
  readonly formId: string;
  readonly translateError: (messageKey: string) => string;
  readonly locked: boolean;
}

/** One field: the control its kind names, its label and required mark, helper and error, wired. */
function SpecField<T extends FieldValues>({
  spec,
  control,
  formId,
  translateError,
  locked,
}: SpecFieldProps<T>): ReactElement {
  const id = `${formId}-${spec.name}`;
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;
  const required = spec.required === true;
  return (
    <Controller
      control={control}
      name={spec.name}
      render={({ field, fieldState }) => {
        const invalid = fieldState.invalid;
        const disabled = locked || spec.disabled === true;
        const key = fieldState.error?.message;
        const describedBy = [
          spec.helper === undefined ? '' : helperId,
          key === undefined ? '' : errorId,
        ]
          .filter((part) => part !== '')
          .join(' ');
        const described = describedBy === '' ? undefined : describedBy;
        const after = (
          <>
            {spec.helper === undefined ? null : (
              <FieldDescription
                id={helperId}
                className={spec.kind === 'checkbox' ? 'ps-6 text-xs' : 'text-xs'}
              >
                {spec.helper}
              </FieldDescription>
            )}
            <FieldError
              id={errorId}
              errors={key === undefined ? [] : [{ message: translateError(key) }]}
            />
          </>
        );

        if (spec.kind === 'custom') {
          return (
            <div className="flex flex-col gap-1">
              {spec.render?.(field, { invalid, disabled, id, describedBy })}
              {after}
            </div>
          );
        }

        if (spec.kind === 'choice') {
          const shared = {
            id,
            label: spec.label,
            options: spec.options,
            required,
            disabled,
            invalid,
            ...(described === undefined ? {} : { describedBy: described }),
            ...(spec.emptyHint === undefined ? {} : { emptyHint: spec.emptyHint }),
          };
          return (
            <div className="flex flex-col gap-1">
              {spec.multiple === true ? (
                <ChoiceField
                  {...shared}
                  multiple
                  value={asList(field.value)}
                  onChange={field.onChange}
                />
              ) : (
                <ChoiceField
                  {...shared}
                  multiple={false}
                  value={asOne(field.value)}
                  onChange={field.onChange}
                />
              )}
              {after}
            </div>
          );
        }

        if (spec.kind === 'checkbox') {
          // A yes/no setting applies on Save like every other field: a checkbox, never a switch (D-24).
          return (
            <div className="flex flex-col gap-1">
              <Label htmlFor={id} className="font-normal">
                <Checkbox
                  id={id}
                  checked={field.value === true}
                  onCheckedChange={(next) => {
                    field.onChange(next === true);
                  }}
                  onBlur={field.onBlur}
                  disabled={disabled}
                  aria-invalid={invalid}
                  aria-required={required || undefined}
                  aria-describedby={described}
                />
                <LabelText label={spec.label} required={required} />
              </Label>
              {after}
            </div>
          );
        }

        if (spec.kind === 'color') {
          return (
            <ColorField
              id={id}
              name={field.name}
              label={spec.label}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder={spec.placeholder}
              required={required}
              disabled={disabled}
              invalid={invalid}
              describedBy={described}
              after={after}
            />
          );
        }

        // No `ref` is handed to a control on purpose: react-hook-form would focus the first invalid
        // input after a failed submit, and the error summary is what takes focus (D-29).
        const common = {
          id,
          name: field.name,
          value: asText(field.value),
          onChange:
            spec.kind === 'number'
              ? (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                  const value = event.target.value;
                  field.onChange(value === '' ? undefined : Number(value));
                }
              : field.onChange,
          onBlur: field.onBlur,
          disabled,
          placeholder: spec.placeholder,
          'aria-invalid': invalid,
          'aria-required': required || undefined,
          'aria-describedby': described,
        };
        return (
          <Field data-invalid={invalid} className="gap-1">
            <FieldLabel htmlFor={id}>
              <LabelText label={spec.label} required={required} />
            </FieldLabel>
            {spec.kind === 'password' ? (
              <PasswordField {...common} />
            ) : spec.kind === 'textarea' ? (
              <Textarea {...common} autoComplete="off" />
            ) : (
              <Input {...common} {...INPUTS[spec.kind]} autoComplete="off" />
            )}
            {after}
          </Field>
        );
      }}
    />
  );
}

/**
 * A form written as data (UIK-01): the screen lists sections and field specs, and the kit decides
 * the control, the width, the required marks, the disclosure, the error summary and the save bar,
 * so no screen can do D-01, D-24 or D-29 differently.
 *
 * - **One card of named sections (D-01).** No tabs and no wizard: an error inside a closed tab is
 *   invisible, which is the reason tabs were rejected. Short fields sit two to a row from `md`,
 *   full-width fields span both; the field's kind decides (`fieldSpan`), never the screen.
 * - **Controls by shape (D-24).** `choice` is `ChoiceField` (radios, checkboxes or a searchable
 *   select by option count), `password` is `PasswordField`, a yes/no is a checkbox applied on Save,
 *   a `color` is a text value with a picker swatch, blank allowed (`ColorField`, D-15).
 * - **Required.** A red `aria-hidden` asterisk plus `aria-required`; one legend line on top.
 * - **Rare fields** sit behind the section's one `DisclosureSection`, forced open while a field
 *   inside has a value or an error.
 * - **Failure (D-29).** Each error under its field AND in a focused `ErrorSummary` named by label;
 *   a summary link focuses the field. A server or network failure is an alert inside the form with
 *   Retry, and the form is never reset. Never only a toast.
 * - **Loading (D-35, D-39).** A section whose data has not arrived shows its real heading over field
 *   blocks while the rest of the form is live.
 * - **Save bar.** Sticky, "Unsaved changes" while dirty, the submit disabled while clean; pending
 *   and read-only disable the body through one `<fieldset>`.
 *
 * Ids: `${formId}-${name}` for the control, `-helper` and `-error` after it; `aria-describedby`
 * lists the ones present. A helper is caption size (12 px, muted, UI-SPEC § Field anatomy), and a
 * checkbox's starts under its label text, past the box and the gap (`ps-6`).
 */
export function SchemaForm<T extends FieldValues>({
  id,
  form,
  sections,
  onValid,
  translateError,
  submitLabel,
  pendingLabel,
  isPending,
  onBack,
  serverError,
  notice,
  readOnly = false,
  secondarySubmit,
  extraErrors = NO_EXTRA_ERRORS,
  backLabel,
}: SchemaFormProps<T>): ReactElement {
  const t = useTranslations('common');
  const formState = useFormState({ control: form.control });
  const disclosed = sections.flatMap(
    (section) => section.disclosure?.fields.map((spec) => spec.name) ?? [],
  );
  const disclosedValues: readonly unknown[] = useWatch({ control: form.control, name: disclosed });
  const watched = new Map(disclosed.map((name, index) => [name, disclosedValues[index]]));
  const locked = isPending || readOnly;

  // The summary mounts in the render AFTER a failed submit; focus it as soon as it exists.
  const summaryNode = useRef<HTMLDivElement | null>(null);
  const focusPending = useRef(false);
  function summaryRef(node: HTMLDivElement | null): void {
    summaryNode.current = node;
    if (node !== null && focusPending.current) {
      focusPending.current = false;
      node.focus();
    }
  }
  function focusSummary(): void {
    if (summaryNode.current === null) focusPending.current = true;
    else summaryNode.current.focus();
  }

  const all = sections.flatMap((section) => [
    ...section.fields,
    ...(section.disclosure?.fields ?? []),
  ]);
  const items: ErrorSummaryItem[] = [
    ...all.flatMap((spec) => {
      const key = form.getFieldState(spec.name, formState).error?.message;
      return key === undefined
        ? []
        : [{ fieldId: `${id}-${spec.name}`, label: spec.label, message: translateError(key) }];
    }),
    ...extraErrors,
  ];

  const grid = (fields: readonly FieldSpec<T>[], alignInputs = false): ReactElement => (
    <FieldGrid
      alignInputs={alignInputs}
      items={fields.map((spec) => ({
        key: spec.name,
        span: spec.span ?? fieldSpan(spec.kind, spec.options, spec.multiple),
        node: (
          <SpecField
            spec={spec}
            control={form.control}
            formId={id}
            translateError={translateError}
            locked={locked}
          />
        ),
      }))}
    />
  );

  return (
    <form
      id={id}
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        // The pressed submit (a SubmitEvent's `submitter`): the secondary's name, else the primary.
        const native = event.nativeEvent;
        const pressed = native instanceof SubmitEvent ? native.submitter : null;
        const name = pressed instanceof HTMLButtonElement ? pressed.name : '';
        const submitter = name !== '' && name === secondarySubmit?.name ? name : null;
        void form.handleSubmit((values) => {
          onValid(values, { submitter });
        }, focusSummary)(event);
      }}
    >
      <Card className="max-w-5xl gap-0 py-0">
        <div className="flex flex-col gap-4 px-6 pt-6">
          {all.some((spec) => spec.required === true) ? (
            <p className="text-xs text-muted-foreground">{t('required_legend')}</p>
          ) : null}
          {notice}
          {serverError === undefined || serverError === null ? null : (
            <Alert variant="destructive" data-testid="form-server-error">
              <Icon name="circle-exclamation" />
              <AlertTitle className="font-semibold">{t('save_failed')}</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2 text-destructive">
                <span>{serverError.message}</span>
                {serverError.onRetry === undefined ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    className="text-foreground"
                    disabled={isPending}
                    onClick={serverError.onRetry}
                  >
                    {t('retry')}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {items.length === 0 ? null : (
            <ErrorSummary ref={summaryRef} items={items} onSelect={focusField} />
          )}
        </div>
        <fieldset data-slot="form-body" disabled={locked} className="min-w-0">
          {sections.map((section, index) => {
            const disclosure = section.disclosure;
            const forceOpen =
              disclosure?.fields.some(
                (spec) =>
                  hasValue(watched.get(spec.name)) ||
                  form.getFieldState(spec.name, formState).invalid,
              ) ?? false;
            return (
              <Fragment key={section.id}>
                {index > 0 ? <Separator /> : null}
                <FormSection
                  id={`${id}-${section.id}`}
                  title={section.title}
                  {...(section.loading === true
                    ? { loading: { count: Math.max(1, section.fields.length) } }
                    : {})}
                >
                  {section.notice}
                  {grid(section.fields, section.alignInputs)}
                  {section.content}
                  {disclosure === undefined ? null : (
                    <DisclosureSection title={disclosure.title} forceOpen={forceOpen}>
                      {grid(disclosure.fields, section.alignInputs)}
                    </DisclosureSection>
                  )}
                </FormSection>
              </Fragment>
            );
          })}
        </fieldset>
      </Card>
      <SaveBar
        formId={id}
        dirty={formState.isDirty}
        submitLabel={submitLabel}
        pendingLabel={pendingLabel}
        isPending={isPending}
        onBack={onBack}
        readOnly={readOnly}
        {...saveBarOptions(secondarySubmit, backLabel)}
      />
    </form>
  );
}
