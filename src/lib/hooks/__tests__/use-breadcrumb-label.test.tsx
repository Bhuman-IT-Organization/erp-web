// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageShell } from '@/components/templates/PageShell';
import shellEn from '@/features/shell/messages/en.json';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, within } from '@/test/render';
import { useBreadcrumbCrumbs, useBreadcrumbLabel, type PageCrumb } from '../use-breadcrumb-label';

const pathname = vi.hoisted(() => ({ current: '/setup/staff/12' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

/** A record page as plans 07/08 write it: it names its record once it has loaded it. */
function RecordPage({ name }: { readonly name: string | null | undefined }) {
  useBreadcrumbLabel(name);
  return <p data-testid="record-page">{name}</p>;
}

// A seeded session: the shell does not bootstrap, and the menu's /me is answered by the fake.
beforeEach(() => {
  pathname.current = '/setup/staff/12';
  setSession({ accessToken: 't', csrfToken: 'c' });
  http.defaults.adapter = fakeAdapter(200, {
    staffId: 1,
    email: 'a@b.co',
    firstName: 'Example',
    lastName: 'Person',
    isAdmin: true,
    roleId: null,
    permissions: [],
    locale: null,
  }).adapter;
});
// Unmount BEFORE the session resets, or a still-mounted shell would start a bootstrap.
afterEach(() => {
  cleanup();
  delete http.defaults.adapter;
  clearSession();
});

const inShell = (page: ReactElement | null) => (
  <SWRConfig value={{ provider: () => new Map() }}>
    <PageShell>{page}</PageShell>
  </SWRConfig>
);

describe('useBreadcrumbLabel', () => {
  it("puts the page's record name in the leaf crumb, marked as the current page (WR-10)", () => {
    renderWithProviders(inShell(<RecordPage name="Example Person" />));
    const leaf = screen.getByText('Example Person', { selector: '[aria-current="page"]' });
    expect(leaf.getAttribute('aria-current')).toBe('page');
    expect(screen.queryByTestId('breadcrumb-skeleton')).toBeNull();
  });

  it('keeps the skeleton while the record is still loading (undefined)', () => {
    renderWithProviders(inShell(<RecordPage name={undefined} />));
    expect(screen.getByTestId('breadcrumb-skeleton')).not.toBeNull();
  });

  it('null says there is no name to wait for: the leaf reads the record placeholder, never the skeleton (D-39)', () => {
    renderWithProviders(inShell(<RecordPage name={null} />));
    expect(screen.queryByTestId('breadcrumb-skeleton')).toBeNull();
    const leaf = screen.getByText(shellEn.shell.record, { selector: '[aria-current="page"]' });
    expect(leaf.getAttribute('aria-current')).toBe('page');
  });

  it('clears the label when the page unmounts', async () => {
    // The page leaves while the shell stays, as on a client-side navigation.
    function Host() {
      const [shown, setShown] = useState(true);
      return (
        <>
          <button
            type="button"
            data-testid="leave"
            onClick={() => {
              setShown(false);
            }}
          />
          {shown ? <RecordPage name="Example Person" /> : null}
        </>
      );
    }
    renderWithProviders(inShell(<Host />));
    expect(screen.queryByTestId('breadcrumb-skeleton')).toBeNull();
    await userEvent.click(screen.getByTestId('leave'));
    expect(screen.getByTestId('breadcrumb-skeleton')).not.toBeNull();
  });

  it('does nothing and does not throw outside a shell', () => {
    renderWithProviders(<RecordPage name="x" />);
    expect(screen.getByTestId('record-page').textContent).toBe('x');
  });
});

/** A record page naming its own crumbs (plan 04.2-28). */
const MESSAGE_PREVIEW: readonly PageCrumb[] = [
  { label: 'Message', href: '/setup/sent-emails/41' },
  { label: 'Preview' },
];
const crumbBar = () => within(screen.getByTestId('breadcrumbs'));
function CrumbsPage({ crumbs }: { readonly crumbs: readonly PageCrumb[] | null }) {
  useBreadcrumbCrumbs(crumbs);
  return <p data-testid="crumbs-page">page</p>;
}

describe('useBreadcrumbCrumbs (plan 04.2-28)', () => {
  beforeEach(() => {
    pathname.current = '/setup/sent-emails/41';
  });

  it("follows the route trail with the page's crumbs: the covering entry becomes a link, the last crumb the leaf", () => {
    renderWithProviders(inShell(<CrumbsPage crumbs={MESSAGE_PREVIEW} />));
    const bar = screen.getByTestId('breadcrumbs');
    expect(
      [...bar.querySelectorAll('li:not([role="presentation"])')].map((li) => li.textContent),
    ).toEqual([
      shellEn.shell.settings_group_email,
      shellEn.shell.sent_emails,
      'Message',
      'Preview',
    ]);
    expect(crumbBar().getByText(shellEn.shell.sent_emails).closest('a')).not.toBeNull();
    expect(crumbBar().getByText('Message').getAttribute('href')).toBe('/setup/sent-emails/41');
    expect(crumbBar().getByText('Preview').getAttribute('aria-current')).toBe('page');
  });

  it('a crumb label undefined is the skeleton and null reads "Record"', () => {
    const { unmount } = renderWithProviders(
      inShell(<CrumbsPage crumbs={[{ label: undefined }]} />),
    );
    expect(screen.getByTestId('breadcrumb-skeleton')).not.toBeNull();
    unmount();
    renderWithProviders(inShell(<CrumbsPage crumbs={[{ label: null }]} />));
    expect(screen.queryByTestId('breadcrumb-skeleton')).toBeNull();
    expect(
      crumbBar().getByText(shellEn.shell.record, { selector: '[aria-current="page"]' }),
    ).not.toBeNull();
  });

  it('clears the crumbs when the page unmounts', async () => {
    function Host() {
      const [shown, setShown] = useState(true);
      return (
        <>
          <button
            type="button"
            data-testid="leave"
            onClick={() => {
              setShown(false);
            }}
          />
          {shown ? <CrumbsPage crumbs={MESSAGE_PREVIEW} /> : null}
        </>
      );
    }
    renderWithProviders(inShell(<Host />));
    expect(crumbBar().getByText('Message')).not.toBeNull();
    await userEvent.click(screen.getByTestId('leave'));
    expect(crumbBar().queryByText('Message')).toBeNull();
    expect(crumbBar().getByText(shellEn.shell.sent_emails)).not.toBeNull();
  });

  it('does nothing and does not throw outside a shell', () => {
    renderWithProviders(<CrumbsPage crumbs={MESSAGE_PREVIEW} />);
    expect(screen.getByTestId('crumbs-page').textContent).toBe('page');
  });
});
