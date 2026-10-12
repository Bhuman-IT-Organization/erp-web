import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LogoutPage } from '@/features/auth/pages/LogoutPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('logout_title') };
}

export default async function Page(props: PageProps<'/logout'>) {
  const sp = await props.searchParams;
  // Perfex's own Logout link arrives here through Nginx (ADR-0038): sign out on arrival, as Perfex's link does.
  return <LogoutPage auto={sp.from === 'legacy'} />;
}
