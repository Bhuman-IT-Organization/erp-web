// @vitest-environment happy-dom
import { act } from '@testing-library/react';
import type { AxiosAdapter } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactElement } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageShell } from '@/components/templates/PageShell';
import { BrandLogo, FALLBACK_BRANDING, type Branding } from '@/features/branding';
import { SwrProvider } from '@/lib/api/SwrProvider';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { DirectionProvider } from '@/lib/i18n/DirectionProvider';
import { messagesFor } from '@/messages';
import { fakeAdapter } from '@/test/axios-fakes';

/**
 * UAT 4.2 gap 1 (plan 04.2-26): React #418 ("the server rendered HTML didn't match the client")
 * on every shell page whose breadcrumb has a parent crumb. The shell's client part is rendered on
 * the "server" with `renderToString`, the HTML is parsed into a container exactly as a browser
 * parses it, and the same tree is hydrated there: React must report no recoverable error.
 */

const pathname = vi.hoisted(() => ({ current: '/setup/taxes' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** Made-up brand with an uploaded logo: the warm path (the branding request answered). */
const WARM_BRANDING: Branding = {
  ...FALLBACK_BRANDING,
  companyName: 'Example Trading',
  logoUrl: '/example/brand-logo.png',
};

/** An api that has not started answering yet: every request stays pending. */
const silentApi: AxiosAdapter = () => new Promise(() => undefined);

const ADMIN_ME = {
  staffId: 1,
  email: 'a@b.co',
  firstName: 'Example',
  lastName: 'Person',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: null,
};

const shell = (branding: Branding): ReactElement => (
  <NextIntlClientProvider locale="en" messages={messagesFor('en')}>
    <DirectionProvider dir="ltr">
      <NuqsTestingAdapter>
        <SwrProvider>
          <PageShell brand={<BrandLogo branding={branding} />} defaultOpen>
            <p data-testid="page-content">Example content</p>
          </PageShell>
        </SwrProvider>
      </NuqsTestingAdapter>
    </DirectionProvider>
  </NextIntlClientProvider>
);

let root: Root | null = null;
let container: HTMLElement | null = null;
const imageDescriptors = {
  complete: Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete'),
  naturalWidth: Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'naturalWidth'),
};

/** Server render, browser parse, client hydration; returns the server HTML and React's recoverable errors. */
async function hydrate(tree: ReactElement): Promise<{ html: string; errors: unknown[] }> {
  const html = renderToString(tree);
  container = document.createElement('div');
  document.body.append(container);
  container.innerHTML = html;
  const errors: unknown[] = [];
  const target = container;
  await act(async () => {
    root = hydrateRoot(target, tree, {
      onRecoverableError: (error) => {
        errors.push(error);
      },
    });
    await Promise.resolve();
  });
  return { html, errors };
}

beforeEach(() => {
  clearSession();
  Object.defineProperty(HTMLImageElement.prototype, 'complete', {
    configurable: true,
    get: () => true,
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => 100,
  });
  // The shell's bootstrap takes the no-Web-Locks path here; the lock itself is use-session's test.
  Object.defineProperty(window.navigator, 'locks', { value: undefined, configurable: true });
  // React DOM warns about invalid nesting through console.error; the assertion is the hydration itself.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  delete http.defaults.adapter;
  clearSession();
  Reflect.deleteProperty(window.navigator, 'locks');
  for (const [key, descriptor] of Object.entries(imageDescriptors)) {
    if (descriptor === undefined) Reflect.deleteProperty(HTMLImageElement.prototype, key);
    else Object.defineProperty(HTMLImageElement.prototype, key, descriptor);
  }
  vi.restoreAllMocks();
});

describe('server render equals the first client render (UAT 4.2 gap 1, React #418)', () => {
  it('cold start: the api not answering yet, the fallback brand, a two-crumb route: no mismatch, the DOM is the server HTML', async () => {
    pathname.current = '/setup/taxes';
    http.defaults.adapter = silentApi;
    const { html, errors } = await hydrate(shell(FALLBACK_BRANDING));
    expect(errors).toEqual([]);
    // Both sides through the same parser, so only the tree is compared, not React's escaping.
    const parsed = document.createElement('div');
    parsed.innerHTML = html;
    expect(container?.innerHTML).toBe(parsed.innerHTML);
    expect(container?.querySelector('[data-testid="breadcrumbs"] li li')).toBeNull();
  });

  it('warm: the brand logo and a known session, a three-crumb record route: no mismatch', async () => {
    pathname.current = '/setup/taxes/12';
    http.defaults.adapter = fakeAdapter(200, ADMIN_ME).adapter;
    setSession({ accessToken: 't', csrfToken: 'c' });
    const { errors } = await hydrate(shell(WARM_BRANDING));
    expect(errors).toEqual([]);
    expect(container?.querySelector('[data-testid="brand-logo"]')).not.toBeNull();
  });
});
