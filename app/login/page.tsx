import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { getBranding } from '@/features/branding/api/branding.server';
import { safeNext } from '@/lib/auth/safe-next';
import { SESSION_PRESENT_COOKIE } from '@/lib/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('page_title') };
}

// Request-time render: `?next=` is read per request and must never be baked in at build time,
// and the brand (logo, company name) is the customer's data, fetched from the API, never built in.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/login'>) {
  const sp = await props.searchParams;
  const raw = typeof sp.next === 'string' ? sp.next : null;
  // A hint only (ADR-0038): with the flag the page ASKS the api whether the session is live; without
  // it there is nothing to ask and the form renders at once.
  const resume = (await cookies()).has(SESSION_PRESENT_COOKIE);
  const branding = await getBranding();
  return <LoginPage next={safeNext(raw)} branding={branding} resume={resume} />;
}
