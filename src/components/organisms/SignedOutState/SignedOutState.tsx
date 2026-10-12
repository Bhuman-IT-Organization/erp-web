'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { safeNext } from '@/lib/auth/safe-next';

/**
 * What `withAuth` renders once the session is KNOWN to be absent (D-14, D-39) — normally never seen,
 * because `proxy.ts` sends an anonymous visitor to `/login` first. A message and a Sign in link, never
 * a client redirect (a redirect layered on the proxy is how a loop starts, FE-16). The way back is
 * the current path through `safeNext` and then `encodeURIComponent`, so the `next` parameter can never
 * name another origin (T-3.2-35). A plain `<a>`: sign-in is a full navigation.
 */
export function SignedOutState(): ReactElement {
  const t = useTranslations('common');
  const pathname = usePathname();
  const href = `/login?next=${encodeURIComponent(safeNext(pathname))}`;
  return (
    <section data-testid="auth-refused" className="flex flex-col items-start gap-2 py-16">
      <h1 className="text-lg font-semibold">{t('session_ended')}</h1>
      <p className="text-muted-foreground text-sm">{t('session_ended_body')}</p>
      <Button asChild className="mt-2">
        <a href={href}>{t('sign_in')}</a>
      </Button>
    </section>
  );
}
