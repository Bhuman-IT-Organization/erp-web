'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  SearchPopover,
  type ChoiceOption,
  type SearchPopoverFieldProps,
} from '@/components/molecules/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CommandItem } from '@/components/ui/command';
import { normalizeSearchText } from '@/lib/i18n/search-text';

export interface SearchableMultiSelectProps extends SearchPopoverFieldProps {
  readonly value: readonly string[];
  readonly onChange: (value: string[]) => void;
  /** `false`: no chips under the trigger (a filter, whose trigger reads "{label} ({count})"; K2). */
  readonly showChips?: boolean;
  /**
   * K9 (tags, variation options, select options): when the typed text matches no option, "Add
   * “{query}”" is the last option, and picking it (Enter) calls `onCreate` with the trimmed text and
   * clears the box. The caller adds the new option and its value; the kit stores nothing.
   */
  readonly creatable?: { readonly onCreate: (text: string) => void };
}

/** The picks as wrapping chips under a trigger, each with a "Remove {label}" button (K7 reuses it). */
export function PickedChips({
  picked,
  disabled,
  onRemove,
}: {
  readonly picked: readonly ChoiceOption[];
  readonly disabled?: boolean | undefined;
  readonly onRemove: (value: string) => void;
}): ReactElement | null {
  const t = useTranslations('common');
  if (picked.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {picked.map((option) => (
        <li key={option.value}>
          <Badge variant="secondary" className="h-6 gap-1 pe-1 text-sm">
            <bdi>{option.label}</bdi>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-4 rounded-full"
              aria-label={t('remove_item', { label: option.label })}
              disabled={disabled}
              onClick={() => {
                onRemove(option.value);
              }}
            >
              <Icon name="xmark" />
            </Button>
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** The cmdk value of the "Add" row: outside any option value a form stores. */
const CREATE_VALUE = '__create__';

/**
 * Several choices from 7 or more options (D-24). The same popover and search as `SearchableSelect`
 * (`SearchPopover`: cmdk filtered by `matchesSearch`, never a `RegExp`), but picking toggles an option and the popover STAYS OPEN, so the member picks several in one go.
 * The trigger reads "{count} selected"; the picks show as wrapping chips under it, in option order,
 * each with a button named "Remove {label}" that removes that one value. A filter passes
 * `showChips={false}` and its own `triggerText` (UI-SPEC § Filter bar: no chips under filter triggers).
 * With `creatable` the box is controlled: an option equal to the typed text (case and diacritics
 * ignored, `normalizeSearchText`) hides "Add", and an empty box over no options reads the hint.
 */
export function SearchableMultiSelect({
  value,
  onChange,
  showChips = true,
  creatable,
  ...field
}: SearchableMultiSelectProps): ReactElement {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const picked = field.options.filter((option) => value.includes(option.value));
  const typed = query.trim();
  const offerCreate =
    creatable !== undefined &&
    typed !== '' &&
    !field.options.some(
      (option) => normalizeSearchText(option.label.trim()) === normalizeSearchText(typed),
    );
  return (
    <div className="flex flex-col gap-1">
      <SearchPopover
        {...field}
        open={open}
        onOpenChange={setOpen}
        summary={value.length === 0 ? undefined : t('selected_count', { count: value.length })}
        isChecked={(candidate) => value.includes(candidate)}
        onPick={(toggled) => {
          onChange(
            value.includes(toggled)
              ? value.filter((kept) => kept !== toggled)
              : [...value, toggled],
          );
        }}
        {...(creatable === undefined
          ? {}
          : {
              search: query,
              onSearchChange: setQuery,
              ...(typed === '' ? { emptyText: t('add_option_hint') } : {}),
              footer: offerCreate ? (
                <CommandItem
                  value={CREATE_VALUE}
                  forceMount
                  onSelect={() => {
                    creatable.onCreate(typed);
                    setQuery('');
                  }}
                >
                  <span className="truncate">{t('add_option', { query: typed })}</span>
                </CommandItem>
              ) : null,
            })}
      />
      {showChips ? (
        <PickedChips
          picked={picked}
          disabled={field.disabled}
          onRemove={(removed) => {
            onChange(value.filter((kept) => kept !== removed));
          }}
        />
      ) : null}
    </div>
  );
}
