// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import shellEn from '@/features/shell/messages/en.json';
import { physicalClassesIn, renderWithProviders, screen } from '@/test/render';
import { Breadcrumbs } from '../Breadcrumbs';

const EN = shellEn.shell;

const pathname = vi.hoisted(() => ({ current: '/setup/staff' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

describe('Breadcrumbs', () => {
  it('renders nothing for a path the menu does not know', () => {
    pathname.current = '/nowhere-at-all';
    const { container } = renderWithProviders(<Breadcrumbs />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a single crumb as the leaf: aria-current and not a link', () => {
    pathname.current = '/setup/staff';
    renderWithProviders(<Breadcrumbs />);
    const leaf = screen.getByText(EN.als_staff);
    expect(leaf.getAttribute('aria-current')).toBe('page');
    expect(leaf.getAttribute('href')).toBeNull();
  });

  it('renders the parent as a link and the New crumb as the leaf', () => {
    pathname.current = '/setup/staff/new';
    renderWithProviders(<Breadcrumbs />);
    const parent = screen.getByText(EN.als_staff);
    expect(parent.getAttribute('href')).toBe('/setup/staff');
    expect(parent.getAttribute('aria-current')).toBeNull();
    const leaf = screen.getByText(EN.new);
    expect(leaf.getAttribute('aria-current')).toBe('page');
  });

  it('shows a fixed-width skeleton for the dynamic crumb until recordLabel arrives', () => {
    pathname.current = '/setup/staff/12';
    renderWithProviders(<Breadcrumbs />);
    const skeleton = screen.getByTestId('breadcrumb-skeleton');
    expect(skeleton.className).toContain('w-24');
    expect(screen.queryByText(EN.record)).toBeNull();
  });

  it('replaces the skeleton with the record name once it is known', () => {
    pathname.current = '/setup/staff/12';
    renderWithProviders(<Breadcrumbs recordLabel="Example Person" />);
    expect(screen.queryByTestId('breadcrumb-skeleton')).toBeNull();
    const leaf = screen.getByText('Example Person');
    expect(leaf.getAttribute('aria-current')).toBe('page');
  });

  it('recordLabel null (the record could not be loaded): the dynamic leaf reads the record placeholder, aria-current, and no skeleton (D-39)', () => {
    pathname.current = '/setup/staff/12';
    renderWithProviders(<Breadcrumbs recordLabel={null} />);
    expect(screen.queryByTestId('breadcrumb-skeleton')).toBeNull();
    const leaf = screen.getByText(EN.record);
    expect(leaf.getAttribute('aria-current')).toBe('page');
  });

  it('a menu container (no page of its own) is text, never a link: Email > Sent emails > the record', () => {
    pathname.current = '/setup/sent-emails/41';
    renderWithProviders(<Breadcrumbs recordLabel="Template 1" />);
    const container = screen.getByText(EN.settings_group_email);
    expect(container.tagName).toBe('SPAN');
    expect(container.closest('a')).toBeNull();
    expect(screen.getByText(EN.sent_emails).getAttribute('href')).toBe('/setup/sent-emails');
    expect(screen.getByText('Template 1').getAttribute('aria-current')).toBe('page');
  });

  it('keeps one line in the 48px top bar: the trail never wraps, a long leaf ends in an ellipsis (375 review)', () => {
    pathname.current = '/setup/sent-emails/41';
    renderWithProviders(
      <Breadcrumbs recordLabel="New application (Send to notification recipient)" />,
    );
    expect(screen.getByTestId('breadcrumbs').className).toContain('min-w-0');
    expect(screen.getByRole('list').className).toContain('flex-nowrap');
    const leaf = screen.getByText('New application (Send to notification recipient)');
    expect(leaf.className).toContain('truncate');
    expect(leaf.closest('li')?.className).toContain('min-w-0');
  });

  it('labels its nav landmark from the shell namespace', () => {
    pathname.current = '/setup/roles';
    renderWithProviders(<Breadcrumbs />);
    expect(screen.getByTestId('breadcrumbs').getAttribute('aria-label')).toBe(EN.breadcrumb_nav);
  });

  it('uses no physical-direction class under ar', () => {
    pathname.current = '/setup/staff/new';
    const { container } = renderWithProviders(<Breadcrumbs />, { locale: 'ar' });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

describe('Breadcrumbs with page crumbs (plan 04.2-28)', () => {
  it('a linked page crumb before the leaf shrinks with an ellipsis; a menu crumb may shrink too once the trail does not fit (04.6-14, 04.8-09, 375)', () => {
    pathname.current = '/setup/sent-emails/41';
    renderWithProviders(
      <Breadcrumbs
        pageCrumbs={[{ label: 'ZZ-MAIL-0041', href: '/setup/sent-emails/41' }, { label: 'Edit' }]}
      />,
    );
    const code = screen.getByText('ZZ-MAIL-0041');
    expect(code.className.split(' ')).toEqual(expect.arrayContaining(['truncate']));
    expect(code.closest('li')?.className.split(' ')).toContain('min-w-0');
    const menu = screen.getByText(EN.sent_emails);
    expect(menu.className.split(' ')).toEqual(expect.arrayContaining(['block', 'truncate']));
    expect(menu.closest('li')?.className.split(' ')).toContain('min-w-0');
  });

  it('a crumb label undefined is the skeleton, null reads "Record"', () => {
    pathname.current = '/setup/sent-emails/12';
    const { unmount } = renderWithProviders(<Breadcrumbs pageCrumbs={[{ label: undefined }]} />);
    expect(screen.getByTestId('breadcrumb-skeleton').className).toContain('w-24');
    unmount();
    renderWithProviders(<Breadcrumbs pageCrumbs={[{ label: null }]} />);
    expect(screen.queryByTestId('breadcrumb-skeleton')).toBeNull();
    expect(screen.getByText(EN.record).getAttribute('aria-current')).toBe('page');
  });

  it.each(['//evil.example', 'https://evil.example', '/\\evil.example'])(
    'a crumb href %s renders as text, never a link (T-4.2-148)',
    (href) => {
      pathname.current = '/setup/sent-emails/41';
      renderWithProviders(
        <Breadcrumbs pageCrumbs={[{ label: 'Elsewhere', href }, { label: 'New' }]} />,
      );
      const crumb = screen.getByText('Elsewhere');
      expect(crumb.closest('a')).toBeNull();
      expect(crumb.getAttribute('href')).toBeNull();
    },
  );
});
