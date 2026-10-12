'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';

export interface SaveBarProps {
  /** The `<form>`'s id: the submit names it, so the bar may sit anywhere in the form's tree. */
  readonly formId: string;
  readonly dirty: boolean;
  /** Verb + noun, already translated: "Save staff member", "Create role" (UI-SPEC copy). */
  readonly submitLabel: string;
  /** Its progressive form: "Saving staff member…". */
  readonly pendingLabel: string;
  readonly isPending: boolean;
  /** Returns to the list the member came from (D-28); the screen owns the discard dialog. */
  readonly onBack: () => void;
  /** Nothing to save: the submit is not rendered. */
  readonly readOnly?: boolean;
  /** The dismissal's text (K11): an editable table's "Discard changes"; default "Back to list". */
  readonly backLabel?: string;
  /** Shown at the inline start while dirty instead of "Unsaved changes" (D-26: "{count} rows changed"). */
  readonly countLabel?: string;
  /**
   * Opt-in, 04.6-14, the two-submit forms (documents with a draft): a second submit,
   * outline, before the primary, carrying `name` so the form knows which was pressed ("Save draft"
   * beside "Save & Send Request"). Absent: today's bar.
   */
  readonly secondarySubmit?: SecondarySubmit;
}

/** The opt-in second submit: its form-data name, its label and its progressive label. */
export interface SecondarySubmit {
  readonly name: string;
  readonly label: string;
  readonly pendingLabel: string;
}

/**
 * The form's sticky save bar (UI-SPEC § Sticky save bar, choice 34): `sticky bottom-0` inside the
 * content column, so it is always reachable and never covers the sidebar; 68 px (a 36 px button with
 * 16 px above and below), a top border on the background fill. "Unsaved changes" at the inline start
 * while dirty; at the inline end "Back to list" (the named dismissal) and the verb + noun submit,
 * disabled while the form is clean. While pending both buttons are disabled and the submit reads its
 * progressive label (FE-27). Below `sm` the text and the buttons may wrap onto two lines.
 *
 * An editable table (K11, 4.2 UI-SPEC § Editable table) names its dismissal (`backLabel`,
 * "Discard changes") and its count (`countLabel`, "{count} rows changed"); both default to the
 * form's texts.
 *
 * A two-submit form (`secondarySubmit`, 04.6-14) gets an outline submit before the primary; the bar
 * remembers which one was pressed (a click, or the browser's implicit submission, which clicks the
 * first submit), so only the pressed one reads its pending label, and while one is pending both are
 * disabled: neither can fire twice, nor both at once (T-4.6-89).
 */
/** One submit of the bar: names the form (and itself, when the form must know which was pressed). */
function Submit({
  formId,
  name,
  outline,
  disabled,
  pending,
  label,
  pendingLabel,
  onPress,
}: {
  readonly formId: string;
  readonly name?: string;
  readonly outline?: boolean;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly label: string;
  readonly pendingLabel: string;
  readonly onPress: () => void;
}): ReactElement {
  return (
    <Button
      type="submit"
      form={formId}
      {...(name === undefined ? {} : { name })}
      {...(outline === true ? { variant: 'outline' as const } : {})}
      size="lg"
      disabled={disabled}
      aria-busy={pending || undefined}
      onClick={onPress}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** The bar's submits: the opt-in secondary first, then the primary; remembers which was pressed. */
function Submits({
  formId,
  disabled,
  isPending,
  submitLabel,
  pendingLabel,
  secondarySubmit,
}: Pick<
  SaveBarProps,
  'formId' | 'isPending' | 'submitLabel' | 'pendingLabel' | 'secondarySubmit'
> & {
  readonly disabled: boolean;
}): ReactElement {
  const [pressed, setPressed] = useState<string | null>(null);
  const secondaryPending = isPending && pressed !== null && pressed === secondarySubmit?.name;
  return (
    <>
      {secondarySubmit === undefined ? null : (
        <Submit
          formId={formId}
          name={secondarySubmit.name}
          outline
          disabled={disabled}
          pending={secondaryPending}
          label={secondarySubmit.label}
          pendingLabel={secondarySubmit.pendingLabel}
          onPress={() => {
            setPressed(secondarySubmit.name);
          }}
        />
      )}
      <Submit
        formId={formId}
        disabled={disabled}
        pending={isPending && !secondaryPending}
        label={submitLabel}
        pendingLabel={pendingLabel}
        onPress={() => {
          setPressed(null);
        }}
      />
    </>
  );
}

export function SaveBar({
  formId,
  dirty,
  submitLabel,
  pendingLabel,
  isPending,
  onBack,
  readOnly = false,
  backLabel,
  countLabel,
  secondarySubmit,
}: SaveBarProps): ReactElement {
  const t = useTranslations('common');
  return (
    <div
      data-testid="save-bar"
      className="sticky bottom-0 z-10 flex min-h-17 flex-wrap items-center gap-x-4 gap-y-2 border-t bg-background px-6 py-4"
    >
      <p className="me-auto text-sm text-muted-foreground">
        {dirty ? (countLabel ?? t('unsaved_changes')) : null}
      </p>
      {/* Wraps: a long submit ("Save expense category custom fields") beside Discard is wider than 375. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="lg" disabled={isPending} onClick={onBack}>
          {backLabel ?? t('back_to_list')}
        </Button>
        {readOnly ? null : (
          <Submits
            formId={formId}
            disabled={!dirty || isPending}
            isPending={isPending}
            submitLabel={submitLabel}
            pendingLabel={pendingLabel}
            {...(secondarySubmit === undefined ? {} : { secondarySubmit })}
          />
        )}
      </div>
    </div>
  );
}
