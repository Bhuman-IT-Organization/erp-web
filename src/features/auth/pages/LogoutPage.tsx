import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { pick } from '@/lib/i18n/pick';

interface LogoutPageProps {
  /** Perfex's own Logout link (`/logout?from=legacy`): sign out on arrival (ADR-0038). */
  readonly auto: boolean;
}

// Server Component rendering the one client button; app/logout/page.tsx renders it.
export async function LogoutPage({ auto }: LogoutPageProps) {
  const t = await getTranslations('auth');
  const messages = pick(await getMessages(), ['common', 'auth']);
  return (
    <main className="flex min-h-full items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('logout_title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>{t('logout_body')}</p>
          <NextIntlClientProvider messages={messages}>
            <LogoutButton auto={auto} />
          </NextIntlClientProvider>
        </CardContent>
      </Card>
    </main>
  );
}
