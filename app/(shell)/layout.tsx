import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { PageShell } from '@/components/templates/PageShell';
import { LegacyLinkGuard } from '@/features/auth';
import { BrandLogo } from '@/features/branding';
import { getBranding } from '@/features/branding/api/branding.server';
import { SHELL_MESSAGE_NAMESPACES } from '@/features/shell';
import { pick } from '@/lib/i18n/pick';

/**
 * The route group that wraps every migrated Node page in the shell (D-10). `/login`, `/logout`
 * and `/status` are deliberately OUTSIDE this group: a signed-in member still lands on the Perfex
 * dashboard, so the shell wraps pages rather than becoming one.
 *
 * A nested provider replaces the messages of the one above it, so the slice must carry `common`
 * as well as `shell` (FE-19) — `SHELL_MESSAGE_NAMESPACES` names both in one place.
 *
 * This layout sets no `dir`: direction follows the locale and is set once in `app/layout.tsx`.
 */
export default async function ShellLayout({ children }: LayoutProps<'/'>) {
  const messages = await getMessages();
  // The brand is rendered HERE, in `app/`, because a route may import a feature while
  // `src/components/**` may not (FE-01) — and it is the one `<img>` the rules allow (FE-17).
  // Server-rendered from the request's cached `getBranding()`, so the chrome costs no extra fetch.
  const branding = await getBranding();
  // The sidebar primitive writes `sidebar_state` (7 days) whenever the desktop sidebar is shown or
  // hidden. Reading it HERE, on the server, keeps a hidden sidebar hidden across reloads with no
  // hydration flash (RESEARCH Pattern 4, Pitfall 5). Anything but 'false' means open (D-10); the
  // cookie carries no secret and gates nothing (T-3.2-30).
  const defaultOpen = (await cookies()).get('sidebar_state')?.value !== 'false';
  return (
    <NextIntlClientProvider messages={pick(messages, [...SHELL_MESSAGE_NAMESPACES])}>
      {/* No size here: the sidebar's brand slot sizes it by height at its natural aspect ratio. */}
      <PageShell brand={<BrandLogo branding={branding} />} defaultOpen={defaultOpen}>
        {children}
      </PageShell>
      {/* Every Perfex link on a shell page waits for the legacy session (quick 261009-lgn). */}
      <LegacyLinkGuard />
    </NextIntlClientProvider>
  );
}
