'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { clearLocaleCookie, writeLocaleCookie } from '@/i18n/locale-cookie';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/locales';
import { usePermissions } from '@/lib/auth/use-permissions';

export interface AccountMenuProps {
  /**
   * Test and story seam, as `LoginForm` has. `null` is "System Default". The real writer sets or
   * clears `erp_locale` and reloads, because the locale is read on the server (`request.ts`).
   */
  readonly writeLocale?: (locale: Locale | null) => void;
}

/** The radio value for "System Default"; never a locale code. */
const SYSTEM_DEFAULT = 'system';

function writeLocaleAndReload(locale: Locale | null): void {
  if (locale === null) clearLocaleCookie();
  else writeLocaleCookie(locale);
  window.location.reload();
}

/**
 * The one account menu of the topbar (D-09, finding 3): the name and e-mail, My profile, the
 * Language sub-menu, a divider, and Sign out last. It replaces Phase 3.1's three sibling items.
 *
 * - **Initials, not a photo** (UI-SPEC choice 27): a photo would be an expression-`src` `<img>`
 *   under `src/components`, which FE-17 refuses.
 * - **My profile** is a plain `<a>` to the Perfex page, presented like a `legacy: true` menu row.
 * - **Sign out** is the `/logout` route, neutral in colour: signing out is not destructive.
 * - **No extra request.** The identity is `usePermissions().me`, the `/me` payload the menu and the
 *   HOCs already read under one SWR key (D-36). While it loads, the trigger is its own skeleton
 *   and there is no menu (D-39).
 * - The Language sub-menu opens toward the inline end; the root `DirectionProvider` mirrors it.
 * - **Non-modal** (`modal={false}`): a modal Radix menu sets `aria-hidden` on the rest of the page
 *   while the trigger inside it stays focusable, which the headless axe run reports as a serious
 *   `aria-hidden-focus`. Esc, Tab and a click outside still close it.
 */
export function AccountMenu({
  writeLocale = writeLocaleAndReload,
}: AccountMenuProps): ReactElement {
  const t = useTranslations('shell');
  const tc = useTranslations('common');
  const current = useLocale();
  const { me, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div
        role="status"
        aria-busy="true"
        data-testid="account-loading"
        className="flex items-center gap-2"
      >
        <span className="sr-only">{tc('loading')}</span>
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="hidden h-3.5 w-16 md:block" />
      </div>
    );
  }

  const fullName = me === undefined ? '' : `${me.firstName} ${me.lastName}`.trim();
  const initials =
    me === undefined ? '' : `${me.firstName.charAt(0)}${me.lastName.charAt(0)}`.toUpperCase();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          data-testid="account-menu"
          aria-label={
            me === undefined ? t('nav_my_profile') : t('account_menu_for', { name: fullName })
          }
          className="h-10 gap-2 px-1"
        >
          {me === undefined ? (
            <Icon name="user-circle" className="size-8" />
          ) : (
            <span
              data-testid="account-initials"
              className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
            >
              {initials}
            </span>
          )}
          {me === undefined ? null : (
            <span data-testid="account-first-name" className="hidden text-sm md:inline">
              {me.firstName}
            </span>
          )}
          <Icon name="chevron-down" className="hidden size-3 md:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {me === undefined ? null : (
          <DropdownMenuLabel data-testid="account-identity" className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-foreground">{fullName}</span>
            <bdi className="text-xs font-normal text-muted-foreground">{me.email}</bdi>
          </DropdownMenuLabel>
        )}
        {me === undefined ? null : <DropdownMenuSeparator />}
        <DropdownMenuItem asChild>
          <a href="/admin/profile" data-testid="account-profile">
            <Icon name="user-circle" />
            {t('nav_my_profile')}
            <Icon name="external-link" className="ms-auto size-3" />
            <span className="sr-only">{t('opens_in_perfex')}</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="account-language">
            <Icon name="languages" />
            {t('language')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={current}>
              <DropdownMenuRadioItem
                value={SYSTEM_DEFAULT}
                data-testid="locale-default"
                onSelect={() => {
                  writeLocale(null);
                }}
              >
                {t('system_default_string')}
              </DropdownMenuRadioItem>
              {SUPPORTED_LOCALES.map((locale) => (
                <DropdownMenuRadioItem
                  key={locale}
                  value={locale}
                  data-testid={`locale-${locale}`}
                  onSelect={() => {
                    writeLocale(locale);
                  }}
                >
                  <span lang={locale}>{t('language_name', { locale })}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/logout" data-testid="account-logout">
            <Icon name="log-out" />
            {t('nav_logout')}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
