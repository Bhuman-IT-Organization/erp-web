'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Controller, useForm, type FieldError as FormFieldError } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  isRetryableLoginCode,
  login,
  messageKeyFor,
  type MessageRef,
} from '@/features/auth/api/auth.endpoints';
import { handoffToLegacy } from '@/features/auth/api/legacy-handoff';
import { useBackgroundHandoff } from '@/features/auth/hooks/use-background-handoff';
import { loginSchema, type LoginInput } from '@/features/auth/schemas/login.schema';
import { writeLocaleCookie } from '@/i18n/locale-cookie';
import { isSupportedLocale, type Locale } from '@/i18n/locales';
import type { ApiAdapter } from '@/lib/api/call-api';
import { forgetLegacySession, isNodePage, openLegacySession } from '@/lib/auth/legacy-session';
import { getAccessToken, RESUMED_AT_KEY, setSession, SIGNED_OUT_AT_KEY } from '@/lib/auth/session';

// Where the legacy Perfex forms still live (kept reachable by the Nginx map, plan 01.3-03).
const LEGACY_LOGIN_2FA = '/admin/authentication?legacy=1';
const LEGACY_FORGOT_PASSWORD = '/admin/authentication/forgot_password';
const LEGACY_LOGIN_AD = LEGACY_LOGIN_2FA;
const TWO_FACTOR_CODE = 'ERP-AUTH-0007';

// Bootstrap/Tailwind classes of the legacy form, translated: 34 px controls, bold labels, the
// neutral-800 block button and the muted bordered secondary (login_admin.php).
const LABEL = 'mb-3 text-sm font-bold text-neutral-800';
const INPUT =
  'h-[38px] rounded border-neutral-300 bg-white px-3 text-sm shadow-[inset_0_1px_1px_rgba(0,0,0,0.075)]';
const PRIMARY =
  'h-auto w-full rounded bg-neutral-800 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700';
const SECONDARY =
  // eslint-disable-next-line no-restricted-syntax -- 1:1 legacy colour: the secondary button background of login_admin.php (btn-default)
  'h-auto w-full rounded border-neutral-300 bg-[#f0f4f8] py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-200';
// eslint-disable-next-line no-restricted-syntax -- 1:1 legacy colour: the fa-windows glyph of login_admin.php
const LEGACY_WINDOWS_BLUE = '#0078d4';

// The four-pane mark the legacy button shows via Font Awesome (fa-windows); inline so no icon
// font is loaded for one glyph. The gap is logical (`me-2`) so it flips with the text direction.
function WindowsMark() {
  return (
    // eslint-disable-next-line no-restricted-syntax -- 1:1 legacy glyph (fa-windows), login_admin.php
    <svg aria-hidden viewBox="0 0 16 16" className="me-2 size-4" fill={LEGACY_WINDOWS_BLUE}>
      <path d="M0 2.2 6.5 1.3v6.3H0V2.2zm7.3-1 8.7-1.2v7.6H7.3V1.2zM0 8.4h6.5v6.3L0 13.8V8.4zm7.3 0H16V16l-8.7-1.2V8.4z" />
    </svg>
  );
}

interface LoginState {
  readonly phase: 'idle' | 'submitting' | 'handoff-failed' | 'error';
  /** A key under the `auth` namespace (+ ICU values); rendered through `t`, never raw text. */
  readonly message: MessageRef | null;
  readonly code: string | null;
}

const IDLE: LoginState = { phase: 'idle', message: null, code: null };

const ref = (key: string): MessageRef => ({ key, values: {} });

/**
 * A successful sign-in supersedes this tab's sign-out and any earlier automatic resume (ADR-0038):
 * the member proved their password, so the next `/login` may resume the new session. Cleared on the
 * login, not after the handoff, because a failed handoff leaves a live Node session to resume. The
 * earlier session's legacy handoff no longer counts either: the new one is handed off afresh.
 */
function clearResumeStamps(): void {
  forgetLegacySession();
  try {
    window.sessionStorage.removeItem(SIGNED_OUT_AT_KEY);
    window.sessionStorage.removeItem(RESUMED_AT_KEY);
  } catch {
    // No storage: LoginResume refuses to resume then anyway.
  }
}

const HANDOFF_FAILED: LoginState = {
  phase: 'handoff-failed',
  message: ref('handoff_failed'),
  code: null,
};

interface LoginFormProps {
  readonly next: string;
  /** Test seams only: a fake transport, a cookie writer double and a handoff double. */
  readonly adapter?: ApiAdapter;
  readonly writeLocale?: (locale: Locale) => void;
  readonly handoff?: (accessToken: string) => Promise<boolean>;
  /** Opens in the handoff-failed state (the /login resume, ADR-0038). */
  readonly handoffFailed?: boolean;
  /** Test seam; the default is a full navigation (a Perfex `next`). */
  readonly navigate?: (href: string) => void;
  /** Test seam; the default is the client-side router (a Node `next`). */
  readonly route?: (href: string) => void;
}

/**
 * The login form. Every request is fired from an event handler (FE-04); the access token goes to
 * module memory only (ADR-0005). The login mutation is NEVER retried automatically: the only retry
 * path is the user's click on "Try again" (ADR-0031 §5). The global banner already says the API
 * is unreachable, so the form's own message stays short. Every visible string is a message key
 * (FE-08): the legacy `_lang.php` keys for what the legacy view shows, ours for the rest.
 */
export function LoginForm({
  next,
  adapter,
  writeLocale = writeLocaleCookie,
  handoff = handoffToLegacy,
  handoffFailed,
  navigate = (href) => {
    // A full navigation on purpose: this `next` is a same-origin path (safeNext) into the legacy
    // PHP app, whose session the handoff has just opened; it is not a Next.js page.
    window.location.assign(href);
  },
  route,
}: LoginFormProps) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const inBackground = useBackgroundHandoff(handoff);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const [state, setState] = useState<LoginState>(handoffFailed === true ? HANDOFF_FAILED : IDLE);

  // zod carries the message KEY (login.schema.ts); the text is resolved here, in the locale.
  function translated(error: FormFieldError | undefined): { message: string }[] {
    return error?.message === undefined ? [] : [{ message: t(error.message) }];
  }

  async function onSubmit(values: LoginInput): Promise<void> {
    setState({ phase: 'submitting', message: null, code: null });
    const result = await login(values, adapter);
    if (!result.ok) {
      setState({
        phase: 'error',
        message: messageKeyFor(result.code, result.retryAfterS),
        code: result.code,
      });
      return;
    }
    setSession({
      accessToken: result.data.accessToken,
      csrfToken: result.data.csrfToken,
      expiresInS: result.data.expiresIn,
    });
    clearResumeStamps();
    // The staff member's own language becomes the locale of every page from the next request on;
    // an unset or unsupported value leaves the cookie as it is.
    if (isSupportedLocale(result.data.user.locale)) writeLocale(result.data.user.locale);
    await enterNext(result.data.accessToken);
  }

  /**
   * A Node `next` is entered at once, through the client-side router so the handoff's request is
   * not cancelled by a page load; the Perfex session opens in the background (quick 261009-lgn). A
   * Perfex `next` needs that session on arrival, so it waits for the handoff, as before.
   */
  async function enterNext(accessToken: string): Promise<void> {
    if (!isNodePage(next)) {
      await completeHandoff(accessToken);
      return;
    }
    inBackground(accessToken);
    if (route === undefined) router.push(next);
    else route(next);
  }

  async function completeHandoff(accessToken: string): Promise<void> {
    const opened = await openLegacySession(accessToken, handoff);
    if (opened) {
      navigate(new URL(next, window.location.origin).href);
      return;
    }
    setState(HANDOFF_FAILED);
  }

  function retryHandoff(): void {
    const token = getAccessToken();
    if (token === null) {
      setState({ phase: 'error', message: ref('sign_in_again'), code: null });
      return;
    }
    void enterNext(token);
  }

  const submitting = state.phase === 'submitting';
  const retryable = state.code !== null && isRetryableLoginCode(state.code);

  return (
    <form
      data-testid="login-form"
      noValidate
      onSubmit={(e) => {
        void form.handleSubmit(onSubmit)(e);
      }}
    >
      {/* Field order, labels and spacing follow the legacy login_admin.php one for one. */}
      <Controller
        control={form.control}
        name="email"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="login-email" className={LABEL}>
              {t('admin_auth_login_email')}
            </FieldLabel>
            <Input
              {...field}
              id="login-email"
              type="email"
              autoComplete="username"
              autoFocus
              aria-invalid={fieldState.invalid}
              disabled={submitting}
              className={INPUT}
            />
            <FieldError errors={translated(fieldState.error)} />
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="password"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="mt-8">
            <span className="inline-flex w-full items-end justify-between">
              <FieldLabel htmlFor="login-password" className={LABEL}>
                {t('admin_auth_login_password')}
              </FieldLabel>
              <a
                className="text-sm text-neutral-500 hover:text-neutral-700"
                href={LEGACY_FORGOT_PASSWORD}
              >
                {t('admin_auth_login_fp')}
              </a>
            </span>
            <Input
              {...field}
              id="login-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={fieldState.invalid}
              disabled={submitting}
              className={INPUT}
            />
            <FieldError errors={translated(fieldState.error)} />
          </Field>
        )}
      />
      {state.message !== null ? (
        <p data-testid="login-error" role="alert" className="text-destructive mt-4 text-sm">
          {t(state.message.key, state.message.values)}
          {state.code === TWO_FACTOR_CODE ? (
            <>
              {' '}
              <a className="underline" href={LEGACY_LOGIN_2FA}>
                {t('open_legacy_sign_in_form')}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-2">
        <Button type="submit" disabled={submitting} className={PRIMARY}>
          {submitting ? t('logging_in') : t('admin_auth_login_button')}
        </Button>
        {retryable ? (
          <Button
            type="button"
            variant="outline"
            data-testid="login-retry"
            className={SECONDARY}
            onClick={() => {
              void onSubmit(form.getValues());
            }}
          >
            {tc('try_again')}
          </Button>
        ) : null}
        {state.phase === 'handoff-failed' ? (
          <Button
            type="button"
            variant="outline"
            data-testid="handoff-retry"
            className={SECONDARY}
            onClick={retryHandoff}
          >
            {tc('retry')}
          </Button>
        ) : null}
      </div>
      <div className="mt-4 text-center">
        <div className="my-4 flex items-center">
          <div className="flex-1 border-t border-neutral-200" />
          <span className="px-3 text-sm text-neutral-500">{tc('or')}</span>
          <div className="flex-1 border-t border-neutral-200" />
        </div>
        {/* Directory sign-in is still the legacy form's feature (ADR-0030: wave 0 migrates the
            password login only); this opens that form, where the AD button submits as before. */}
        <Button asChild variant="outline" className={SECONDARY}>
          <a href={LEGACY_LOGIN_AD}>
            <WindowsMark />
            {t('sign_in_with_active_directory')}
          </a>
        </Button>
      </div>
    </form>
  );
}
