'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { StatusBadge, type StatusBadgeProps } from '@/components/molecules/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface StatusMenuOption {
  readonly value: string;
  /** Translated: the status word, read as "Mark as {label}". */
  readonly label: string;
}

export interface StatusMenuProps {
  readonly status: StatusBadgeProps['status'];
  /** Translated: the badge's word. */
  readonly label: string;
  /** Present with `onMark`: the menu; absent: exactly the plain badge. */
  readonly options?: readonly StatusMenuOption[];
  /** The current value, left out of the items. */
  readonly current?: string;
  readonly onMark?: (value: string) => void;
  /** Translated: the trigger's accessible name ("Change status of {code}"); the badge word when absent. */
  readonly triggerLabel?: string;
  /** Translated: a non-interactive first row ("The customer is e-mailed about each change."). */
  readonly caption?: string;
  /** Disables the trigger; the trigger's accessible name becomes "Changing status…". */
  readonly pending?: boolean;
}

/**
 * K24 (04.7 UI-SPEC § Kit additions, § Status marks): a `StatusBadge` followed, when the feature
 * passes `options` and `onMark` (a holder of the edit code, after the write cutover), by a 32px ghost
 * `chevron-down` trigger 4px after the badge, opening a non-modal dropdown of "Mark as {status}"
 * items, one per option except the current, in the given order, after an optional caption row. A
 * choice calls `onMark(value)` at once (Perfex's immediate mark; the feature shows the toast).
 * `pending` disables the trigger and renames it "Changing status…". Without `options` or `onMark` it
 * is exactly the plain badge. Logical layout only (FE-20).
 */
export function StatusMenu({
  status,
  label,
  options,
  current,
  onMark,
  triggerLabel,
  caption,
  pending = false,
}: StatusMenuProps): ReactElement {
  const t = useTranslations('common');
  const badge = <StatusBadge status={status} label={label} />;
  if (options === undefined || onMark === undefined) return badge;
  return (
    <span className="inline-flex items-center gap-1">
      {badge}
      <DropdownMenu modal={false}>
        {/* Radix opens on pointerdown from its own prop, so the trigger itself is disabled. */}
        <DropdownMenuTrigger asChild disabled={pending}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={pending ? t('changing_status') : (triggerLabel ?? label)}
          >
            <Icon name="chevron-down" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        {/* The primitive sizes the menu to its trigger; a 32px icon trigger needs a fixed width. */}
        <DropdownMenuContent align="end" className="w-64">
          {caption === undefined ? null : (
            <DropdownMenuLabel className="font-normal">{caption}</DropdownMenuLabel>
          )}
          {options
            .filter((option) => option.value !== current)
            .map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => {
                  onMark(option.value);
                }}
              >
                {t('mark_as', { status: option.label })}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
