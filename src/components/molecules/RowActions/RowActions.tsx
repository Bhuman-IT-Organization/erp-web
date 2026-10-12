'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement, SyntheticEvent } from 'react';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';

export interface RowAction {
  readonly id: string;
  /** The short visible label ("View", "Delete"). */
  readonly label: string;
  /** The full accessible name, naming the record ("View Jane Doe", "Delete role Warehouse Supervisor"). */
  readonly ariaLabel: string;
  readonly icon: IconName;
  readonly kind: 'main' | 'neutral' | 'destructive';
  /** A navigation (a Node route); else `onSelect` runs. */
  readonly href?: string | undefined;
  readonly onSelect?: (() => void) | undefined;
}

export interface RowActionsProps {
  /** The record's name, for the kebab's accessible name "Actions for {name}". */
  readonly recordName: string;
  /** Only the actions the user holds the gate for: an action they lack is not rendered at all. */
  readonly actions: readonly RowAction[];
  /**
   * The editable table's row (lead 2026-10-03): at `md`+ only the main actions inline, as quiet
   * small outline buttons, and every action in the "Actions for {name}" menu at every width.
   */
  readonly compact?: boolean;
  /**
   * The menu button's accessible name when "Actions for {name}" does not read right (the document lines
   * editor's "Actions for line {n}", K14); default `actions_for` with `recordName`.
   */
  readonly menuLabel?: string;
}

const VARIANT = { main: 'default', neutral: 'ghost', destructive: 'ghost' } as const;
const INLINE_CLASS = {
  main: undefined,
  neutral: undefined,
  destructive: 'text-destructive hover:bg-destructive/10 hover:text-destructive',
} as const;

// The list row opens its record on click (UI-SPEC choice 16); an action is not that click.
const stop = (event: SyntheticEvent): void => {
  event.stopPropagation();
};

function InlineAction({
  action,
  compact,
}: {
  readonly action: RowAction;
  readonly compact: boolean;
}): ReactElement {
  const content = (
    <>
      <Icon name={action.icon} />
      {action.label}
    </>
  );
  const common = {
    variant: compact ? 'outline' : VARIANT[action.kind],
    size: compact ? 'sm' : 'default',
    className: INLINE_CLASS[action.kind],
    'aria-label': action.ariaLabel,
  } as const;
  return action.href === undefined ? (
    <Button type="button" {...common} onClick={action.onSelect}>
      {content}
    </Button>
  ) : (
    <Button asChild {...common}>
      <Link href={action.href}>{content}</Link>
    </Button>
  );
}

function MenuAction({ action }: { readonly action: RowAction }): ReactElement {
  const variant = action.kind === 'destructive' ? 'destructive' : 'default';
  const content = (
    <>
      <Icon name={action.icon} />
      {action.label}
    </>
  );
  return action.href === undefined ? (
    <DropdownMenuItem
      variant={variant}
      aria-label={action.ariaLabel}
      onSelect={() => {
        action.onSelect?.();
      }}
    >
      {content}
    </DropdownMenuItem>
  ) : (
    <DropdownMenuItem variant={variant} aria-label={action.ariaLabel} asChild>
      <Link href={action.href}>{content}</Link>
    </DropdownMenuItem>
  );
}

/** The "Actions for {name}" menu: the leading actions, then the destructive ones after a separator. */
function ActionsMenu({
  label,
  leading,
  destructive,
}: {
  readonly label: string;
  readonly leading: readonly RowAction[];
  readonly destructive: readonly RowAction[];
}): ReactElement {
  return (
    // Non-modal: a modal menu aria-hides the page while its trigger stays focusable (axe aria-hidden-focus). Esc, Tab and a click outside still close it.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label}>
          <Icon name="ellipsis-vertical" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {leading.map((action) => (
          <MenuAction key={action.id} action={action} />
        ))}
        {destructive.length > 0 && leading.length > 0 ? <DropdownMenuSeparator /> : null}
        {destructive.map((action) => (
          <MenuAction key={action.id} action={action} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Where the kebab shows: every width while compact leaves actions out of the inline row; a compact
 * row whose actions all fit inline keeps the kebab's place, invisible, at md+, so its main action
 * lines up with the rows above and below (04.6-14 review: a Returned document among drafts); else
 * below md only.
 */
const menuClassOf = (compact: boolean, everywhere: boolean): string => {
  if (everywhere) return 'flex items-center';
  return compact ? 'flex items-center md:invisible' : 'md:hidden';
};

/**
 * A list row's actions (UI-SPEC § Row actions; ui-kit-decisions §2).
 *
 * - **`md` and up:** labelled 32 px buttons at the row's inline end. The main action comes first and
 *   is FILLED WITH THE BRAND — "View" must read as something to click (D-07, finding 4). Neutral
 *   actions are ghost. Destructive actions come LAST, set apart by a vertical separator, ghost in the
 *   fixed destructive red with their own icon (D-06: a brand can never make Delete look like Save).
 * - **Below `md`:** one icon button named "Actions for {name}" opens a menu (inline end) with the
 *   same items, labels and icons; destructive items after a separator, in the destructive variant.
 * - **`compact`** (the editable table): at `md`+ only the main actions inline, small and outline
 *   (quiet beside the row's text), and the kebab at every width while it holds more than those.
 *
 * Every control's accessible name includes the record; the visible label stays short. A click on
 * any of them stops propagating, so the row does not also open (a React handler on the row; a
 * native listener must skip `[data-row-ignore]`). The breakpoint is the literal `hidden md:flex` /
 * `md:hidden` pair: Tailwind sees only literal class names.
 */
export function RowActions({
  recordName,
  actions,
  compact = false,
  menuLabel,
}: RowActionsProps): ReactElement {
  const t = useTranslations('common');
  const main = actions.filter((a) => a.kind === 'main');
  const leading = [...main, ...actions.filter((a) => a.kind === 'neutral')];
  const destructive = actions.filter((a) => a.kind === 'destructive');
  const inlineLeading = compact ? main : leading;
  const inlineDestructive = compact ? [] : destructive;
  // The kebab is md+ too when compact leaves actions out of the inline row.
  const menuEverywhere = compact && main.length < actions.length;
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- not a control: it only keeps its buttons' clicks (and Enter on them, which is a click) from reaching the row
    <div data-row-ignore="" className="flex justify-end gap-2" onClick={stop}>
      <div data-testid="row-actions-inline" className="hidden md:flex md:items-center md:gap-2">
        {inlineLeading.map((action) => (
          <InlineAction key={action.id} action={action} compact={compact} />
        ))}
        {inlineDestructive.length > 0 && leading.length > 0 ? (
          <Separator orientation="vertical" className="mx-2 h-6" />
        ) : null}
        {inlineDestructive.map((action) => (
          <InlineAction key={action.id} action={action} compact={compact} />
        ))}
      </div>
      <div data-testid="row-actions-menu" className={menuClassOf(compact, menuEverywhere)}>
        <ActionsMenu
          label={menuLabel ?? t('actions_for', { name: recordName })}
          leading={leading}
          destructive={destructive}
        />
      </div>
    </div>
  );
}
