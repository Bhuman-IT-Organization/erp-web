'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
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
import { mergeFieldNameKey } from '@/features/mail/schemas/mail-names';
import { matchesSearch } from '@/lib/i18n/search-text';

/** One merge field of the template: its token (no braces) and whether it is a link. */
export interface MergeField {
  readonly token: string;
  readonly kind: 'text' | 'url';
}

export interface InsertMergeFieldProps {
  /** The full label of the field it inserts into: the button is "Insert merge field into {field}". */
  readonly fieldLabel: string;
  /** This template's merge fields only (UI-SPEC: never the whole template type's). */
  readonly fields: readonly MergeField[];
  /** The input or textarea the token goes into, read at the moment of the insert. */
  readonly target: () => HTMLInputElement | HTMLTextAreaElement | null;
  /** The field's next value; the form marks itself dirty. */
  readonly onInsert: (nextValue: string) => void;
  readonly disabled: boolean;
}

/** A merge field as it is typed in the wording: `{token}` (data, shown in `<bdi>`). */
export const tokenText = (token: string): string => `{${token}}`;

/** cmdk's filter: each option carries its name and token as keywords; `includes`, never a RegExp. */
function filterByKeywords(_value: string, search: string, keywords?: string[]): number {
  return matchesSearch((keywords ?? []).join(' '), search) ? 1 : 0;
}

/**
 * "Insert merge field" (04.3 UI-SPEC § Insert merge field, Perfex's "Available merge fields"
 * column): an outline 32px button with `plus` at the inline end of a field's label row, opening a
 * popover with a searchable command list (the `SearchPopover` form) of this template's fields, each
 * its name over its token in `<bdi>`. Enter or a click puts `{token}` at the caret of the field the
 * button belongs to, replacing a selection, closes the list and gives the field its focus back with
 * the caret after the token; Esc closes and focus returns to the button (Radix's default). The
 * search is `matchesSearch` (normalised `includes`): a `(` finds nothing and throws nothing.
 */
export function InsertMergeField({
  fieldLabel,
  fields,
  target,
  onInsert,
  disabled,
}: InsertMergeFieldProps): ReactElement {
  const t = useTranslations('mail');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Where the caret goes after an insert; read when the popover hands focus back.
  const caret = useRef<number | null>(null);

  const nameOf = (token: string): string => {
    const key = mergeFieldNameKey(token);
    return key === null ? token : t(key);
  };

  function insert(token: string): void {
    const el = target();
    if (el === null) return;
    const value = el.value;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${tokenText(token)}${value.slice(end)}`;
    flushSync(() => {
      onInsert(next);
    });
    caret.current = start + token.length + 2;
    setOpen(false);
  }

  /** After an insert the field, not the button, takes the focus, with the caret after the token. */
  function returnFocus(event: Event): void {
    const position = caret.current;
    const el = target();
    if (position === null || el === null) return;
    event.preventDefault();
    caret.current = null;
    el.focus();
    el.setSelectionRange(position, position);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={t('insert_merge_field_into', { field: fieldLabel })}
        >
          <Icon name="plus" />
          {t('insert_merge_field')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={t('available_merge_fields')}
        className="w-80 max-w-[calc(100vw-2rem)] p-0"
        onCloseAutoFocus={returnFocus}
      >
        <Command filter={filterByKeywords} label={t('available_merge_fields')}>
          <CommandInput
            placeholder={t('search_merge_fields')}
            value={query}
            onValueChange={setQuery}
          />
          {/* Outside the listbox: a listbox may hold only options (axe aria-required-children). */}
          <CommandEmpty>{t('merge_field_no_match', { query })}</CommandEmpty>
          <CommandList label={t('available_merge_fields')}>
            {fields.map((field) => {
              const name = nameOf(field.token);
              return (
                <CommandItem
                  key={field.token}
                  value={field.token}
                  keywords={[name, field.token]}
                  className="min-h-12 flex-col items-start gap-0"
                  onSelect={() => {
                    insert(field.token);
                  }}
                >
                  <span>{name}</span>
                  <bdi className="text-xs text-muted-foreground group-data-selected/command-item:text-foreground">
                    {tokenText(field.token)}
                  </bdi>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
