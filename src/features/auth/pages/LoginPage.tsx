import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { LoginLogo } from '@/features/auth/components/LoginLogo';
import { LoginResume } from '@/features/auth/components/LoginResume';
import type { Branding } from '@/features/branding';
import { pick } from '@/lib/i18n/pick';

interface LoginPageProps {
  readonly next: string;
  readonly branding: Branding;
  /** `erp_session_present` was sent: ask the api before showing the form (ADR-0038). */
  readonly resume: boolean;
}

// Server Component: the composition rendered by app/login/page.tsx. `next` is already sanitised.
//
// Layout and classes mirror the legacy Perfex screen
// (application/views/authentication/login_admin.php) one for one — logo, heading, subtitle,
// card — so staff see the same page whether Nginx sends them to the new UI or the old one.
// Everything customer-specific comes from `branding`; nothing is hard-coded here. Every string
// is a message key (the legacy `_lang.php` key where the view has one — see README `## Messages`);
// the client subtree gets the `common` + `auth` slices (a nested provider replaces the messages).
export async function LoginPage({ next, branding, resume }: LoginPageProps) {
  const t = await getTranslations('auth');
  const messages = pick(await getMessages(), ['common', 'auth']);
  return (
    <main className="flex-1 bg-neutral-100">
      <div className="mx-auto max-w-md pt-24 pb-16">
        <LoginLogo branding={branding} />
        <div className="mt-8 mb-5 text-center">
          <h1 className="mb-1 text-2xl font-bold text-neutral-800">
            {t('admin_auth_login_heading')}
          </h1>
          <p className="text-neutral-600">{t('welcome_back_sign_in')}</p>
        </div>
        <div className="mx-2 rounded-lg border border-solid border-neutral-600/20 bg-white px-6 py-8 shadow-sm sm:mx-6 sm:px-8">
          <NextIntlClientProvider messages={messages}>
            {resume ? <LoginResume next={next} /> : <LoginForm next={next} />}
          </NextIntlClientProvider>
        </div>
      </div>
    </main>
  );
}
