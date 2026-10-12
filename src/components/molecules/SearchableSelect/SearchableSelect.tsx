'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { matchesSearch } from '@/lib/i18n/search-text';
import { cn } from '@/lib/utils';

/** One choice: the value the form stores and the already-translated label the member reads (FE-01). */
export interface ChoiceOption {
  readonly value: string;
  readonly label: string;
  /**
   * Opt-in (04.8-16): a second line at caption size under the label in the open list, matched by the
   * search too (a batch's expiry, quantity and price, so two batches differing only in price are
   * told apart); the trigger shows the label alone. Already translated.
   */
  readonly detail?: string;
}

/**
 * "None yet, create one" (lead 2026-10-03): what a choice whose options come from another list says
 * when that list is empty, in place of "No matches". Already translated; `action` links to the place
 * that creates one. A list or form definition names it once; the kit draws it for every module.
 */
export interface EmptyHint {
  readonly text: string;
  readonly action?: { readonly label: string; readonly href: string };
}

/** What the single and the multi select share: the field's id and ARIA state, and the options. */
export interface SearchPopoverFieldProps {
  readonly id: string;
  readonly options: readonly ChoiceOption[];
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly required?: boolean | undefined;
  readonly describedBy?: string | undefined;
  /** Replaces the trigger's own text: a filter shows its label, or "{label} ({count})" when set (K2). */
  readonly triggerText?: string | undefined;
  /** The muted trigger text while nothing is chosen; "Nothing selected" when absent ("Select item", K7). */
  readonly placeholder?: string | undefined;
  /**
   * Shown instead of "No matches" only while the option list itself is empty; a search that matches
   * nothing in a non-empty list still says "No matches". A status (loading) hides it, as it hides
   * the empty text. Pass it only once the options have loaded.
   */
  readonly emptyHint?: EmptyHint | undefined;
}

export interface SearchPopoverProps extends SearchPopoverFieldProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The trigger's text (a label may sit in `<bdi>`); `undefined` shows the placeholder in muted text. */
  readonly summary: ReactNode;
  readonly isChecked: (value: string) => boolean;
  readonly onPick: (value: string) => void;
  /** The search box's text, controlled (K7, K9); uncontrolled when absent. */
  readonly search?: string;
  readonly onSearchChange?: (query: string) => void;
  /** `true` (default): cmdk filters the options locally with `filterByLabel`; `false`: the server did. */
  readonly shouldFilter?: boolean;
  /** Rendered inside the list after the options: `CommandItem`s ("Show more results", "Add …"). */
  readonly footer?: ReactNode;
  /** Replaces "No matches" when no option is left. */
  readonly emptyText?: string;
  /**
   * Shown between the search box and the list, OUTSIDE the listbox (a skeleton or an error is not an
   * option, axe aria-required-children), and while it is shown the empty text is not (D-39: nothing
   * reads "no match" before the answer is known).
   */
  readonly status?: ReactNode;
  /** The search box's placeholder; "Search…" when absent. */
  readonly searchPlaceholder?: string;
  /** The highlighted option's value, controlled (K7 moves it to the first new row after "Show more"). */
  readonly activeValue?: string;
  readonly onActiveValueChange?: (value: string) => void;
  /** The search box's keydown, before cmdk's own: `preventDefault()` on Enter keeps cmdk from picking. */
  readonly onSearchKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Extra classes for the popover (K7: `md:min-w-96`). */
  readonly contentClassName?: string;
}

/**
 * cmdk's filter over the one matcher the sidebar uses (D-38): each item carries its label as a
 * keyword, and the match is `normalize` + `includes`: case and Arabic diacritics ignored, and never
 * a `RegExp` built from what the member typed (T-3.2-38).
 */
function filterByLabel(_value: string, search: string, keywords?: string[]): number {
  return matchesSearch((keywords ?? []).join(' '), search) ? 1 : 0;
}

/**
 * `{ [key]: value }` only when `value` is defined: an optional cmdk prop is left out rather than set
 * to `undefined` (exactOptionalPropertyTypes), so an uncontrolled box or highlight stays uncontrolled.
 */
function given<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

type SearchListProps = Pick<
  SearchPopoverProps,
  | 'options'
  | 'isChecked'
  | 'onPick'
  | 'search'
  | 'onSearchChange'
  | 'shouldFilter'
  | 'footer'
  | 'emptyText'
  | 'status'
  | 'searchPlaceholder'
  | 'activeValue'
  | 'onActiveValueChange'
  | 'onSearchKeyDown'
  | 'emptyHint'
> & {
  /** Closes the popover: the hint's link leaves the page, so the popover must not stay open over it. */
  readonly onClose: () => void;
};

/** The hint's text and its link; outside the listbox like the empty text (axe aria-required-children). */
function EmptyHintText({
  hint,
  onClose,
}: {
  readonly hint: EmptyHint;
  readonly onClose: () => void;
}): ReactElement {
  return (
    <div className="flex flex-col items-center gap-1 px-2">
      <p>{hint.text}</p>
      {hint.action === undefined ? null : (
        <Button asChild variant="link" size="sm" className="h-auto whitespace-normal underline">
          <Link href={hint.action.href} onClick={onClose}>
            {hint.action.label}
          </Link>
        </Button>
      )}
    </div>
  );
}

/** The search box, the empty text or status, and the listbox inside the popover. */
function SearchList({
  options,
  isChecked,
  onPick,
  search,
  onSearchChange,
  shouldFilter = true,
  footer,
  emptyText,
  status,
  searchPlaceholder,
  activeValue,
  onActiveValueChange,
  onSearchKeyDown,
  emptyHint,
  onClose,
}: SearchListProps): ReactElement {
  const t = useTranslations('common');
  const empty =
    emptyHint !== undefined && options.length === 0 ? (
      <EmptyHintText hint={emptyHint} onClose={onClose} />
    ) : (
      (emptyText ?? t('no_matches'))
    );
  return (
    <Command
      filter={filterByLabel}
      shouldFilter={shouldFilter}
      label={t('search_options')}
      {...given('value', activeValue)}
      {...given('onValueChange', onActiveValueChange)}
    >
      <CommandInput
        placeholder={searchPlaceholder ?? t('search_options')}
        {...given('value', search)}
        {...given('onValueChange', onSearchChange)}
        {...given('onKeyDown', onSearchKeyDown)}
      />
      {/* Outside the listbox: a listbox may hold only options (axe aria-required-children). */}
      {status ?? <CommandEmpty>{empty}</CommandEmpty>}
      <CommandList label={t('search_options')}>
        {options.map((option) => {
          const checked = isChecked(option.value);
          return (
            <CommandItem
              key={option.value}
              value={option.value}
              keywords={
                option.detail === undefined ? [option.label] : [option.label, option.detail]
              }
              data-checked={checked}
              aria-checked={checked}
              onSelect={() => {
                onPick(option.value);
              }}
            >
              {option.detail === undefined ? (
                option.label
              ) : (
                <span className="flex min-w-0 flex-col whitespace-normal">
                  <span>{option.label}</span>
                  {/* Muted on the highlighted option's muted fill fails AA: it darkens there (axe color-contrast). */}
                  <span className="text-muted-foreground group-data-selected/command-item:text-foreground text-xs">
                    {option.detail}
                  </span>
                </span>
              )}
            </CommandItem>
          );
        })}
        {footer}
      </CommandList>
    </Command>
  );
}

/**
 * The trigger, popover and searchable list that `SearchableSelect` and `SearchableMultiSelect`
 * share (UI-SPEC § Control selection). The trigger looks like the `Select` trigger (32 px,
 * `chevron-down` at the inline end) and is a `combobox` whose name is the field's `<label for>`;
 * `aria-controls` is Radix's, naming the popover (`aria-haspopup="dialog"`) that holds the listbox.
 * A picked option carries `data-checked` (the primitive's check glyph) and `aria-checked`.
 */
export function SearchPopover({
  id,
  disabled,
  invalid,
  required,
  describedBy,
  triggerText,
  placeholder,
  open,
  onOpenChange,
  summary,
  contentClassName,
  ...list
}: SearchPopoverProps): ReactElement {
  const t = useTranslations('common');
  const text = triggerText ?? summary ?? undefined;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          disabled={disabled}
          className="h-8 w-full justify-between font-normal"
        >
          <span
            className={cn(
              'truncate',
              // Muted on the open trigger's muted fill fails AA, so the placeholder darkens while open.
              text === undefined &&
                'text-muted-foreground group-aria-expanded/button:text-foreground',
            )}
          >
            {text ?? placeholder ?? t('dropdown_non_selected_tex')}
          </span>
          <Icon name="chevron-down" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={t('search_options')}
        className={cn('w-(--radix-popover-trigger-width) min-w-48 p-0', contentClassName)}
      >
        <SearchList
          {...list}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface SearchableSelectProps extends SearchPopoverFieldProps {
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
}

/**
 * One choice from 7 or more options (D-24: Role, Default Language, Department). It allows exactly
 * one value: picking an option calls `onChange` with that one string and closes the popover.
 * `ChoiceField` renders it; a screen does not pick it by hand.
 */
export function SearchableSelect({
  value,
  onChange,
  ...field
}: SearchableSelectProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <SearchPopover
      {...field}
      open={open}
      onOpenChange={setOpen}
      summary={field.options.find((option) => option.value === value)?.label}
      isChecked={(candidate) => candidate === value}
      onPick={(picked) => {
        onChange(picked);
        setOpen(false);
      }}
    />
  );
}
