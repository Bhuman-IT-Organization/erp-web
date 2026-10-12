// @vitest-environment happy-dom
import { act, type ComponentProps, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import shellEn from '@/features/shell/messages/en.json';
import { useUnsavedChanges } from '@/lib/hooks/use-unsaved-changes';
import ar from '@/messages/common/ar.json';
import en from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import { TabLinks, type TabLink } from '../TabLinks';

const COMMON = en.common;
const COMMON_AR = ar.common;
const SHELL = shellEn.shell;

const { pathname } = vi.hoisted(() => ({ pathname: { value: '/setup/cost-centers/7' } }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

// A stand-in that marks every anchor next/link renders, so a router link can be told from a plain
// one (both are `<a href>` in the DOM); `ref` is a prop in React 19, so the spread forwards it.
vi.mock('next/link', () => ({
  default: function NextLink({ href, ...rest }: ComponentProps<'a'> & { href: string }) {
    return <a href={href} data-next-link="" {...rest} />;
  },
}));

const RECORD: readonly TabLink[] = [
  { id: 'detail', label: 'Detail', href: '/setup/cost-centers/7' },
  { id: 'in-use', label: 'In use', href: '/setup/cost-centers/7/in-use' },
  { id: 'change-log', label: 'Change log', href: '/setup/cost-centers/7/change-log' },
];
const SETTINGS: readonly TabLink[] = [
  {
    id: 'general',
    label: 'General',
    href: '/admin/settings?group=general',
    legacy: true,
  },
  { id: 'staff', label: 'Staff', href: '/setup/staff' },
  { id: 'roles', label: 'Roles', href: '/setup/roles' },
];
const TABS = SETTINGS.filter((link) => link.legacy !== true);
const PERFEX: readonly TabLink[] = [
  ...SETTINGS.filter((link) => link.legacy === true),
  {
    id: 'localization',
    label: 'Localization',
    href: '/admin/settings?group=localization',
    legacy: true,
  },
];

const classes = (element: Element | null): string[] =>
  (element?.getAttribute('class') ?? '').split(' ');

beforeEach(() => {
  pathname.value = '/setup/cost-centers/7';
  window.history.replaceState(null, '', '/setup/cost-centers/7');
});

/** A ResizeObserver the test drives: `resize` reports the inline sizes it is given (quick 261003-ovf). */
class FakeResizeObserver {
  static current: FakeResizeObserver | null = null;
  readonly targets: Element[] = [];
  readonly unobserve = vi.fn();
  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.current = this;
  }
  observe(target: Element): void {
    this.targets.push(target);
  }
  disconnect(): void {
    this.targets.length = 0;
  }
}

interface Sizes {
  readonly row: number;
  readonly more: number;
  /** By label: a tab's measuring copy carries its label in `data-label`. */
  readonly tabs: Readonly<Record<string, number>>;
}

/** Reports these inline sizes for every observed box (the row, each tab's copy, More's copy), tabs 8px apart. */
function resize(sizes: Sizes): void {
  const observer = FakeResizeObserver.current;
  if (observer === null) throw new Error('no ResizeObserver');
  const sizeOf = (target: Element): number => {
    if (target.tagName === 'NAV') return sizes.row;
    if (target.hasAttribute('data-more-measure')) return sizes.more;
    return sizes.tabs[target.getAttribute('data-label') ?? ''] ?? 0;
  };
  for (const target of observer.targets) {
    if (target.parentElement instanceof HTMLElement) target.parentElement.style.columnGap = '8px';
  }
  const entries = observer.targets.map(
    (target) =>
      ({
        target,
        borderBoxSize: [{ inlineSize: sizeOf(target), blockSize: 36 }],
      }) as unknown as ResizeObserverEntry,
  );
  act(() => {
    observer.callback(entries, observer);
  });
}

/** The labels of the links the row shows. */
const rowLabels = (nav: HTMLElement): (string | null)[] =>
  [...(nav.querySelector('ul')?.querySelectorAll('a') ?? [])].map((link) => link.textContent);

/** Opens More and answers its items' labels. */
async function menuLabels(nav: HTMLElement, more = COMMON.more): Promise<(string | null)[]> {
  await userEvent.click(within(nav).getByRole('button', { name: more }));
  const menu = await screen.findByRole('menu');
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
}

/** Five tabs of 100px: three fit a 400px row beside an 80px More (3 x 100 + 2 x 8 = 316 <= 320). */
const FIVE: readonly TabLink[] = ['Staff', 'Roles', 'Taxes', 'Currencies', 'Samples'].map(
  (name) => ({
    id: name.toLowerCase(),
    label: name,
    href: `/setup/${name.toLowerCase()}`,
  }),
);
const FIVE_SIZES: Sizes = {
  row: 400,
  more: 80,
  tabs: Object.fromEntries(FIVE.map((link) => [link.label, 100])),
};
const GENERAL = SETTINGS.filter((link) => link.legacy === true);
const LOCALIZATION = PERFEX.filter((link) => link.id === 'localization');

describe('TabLinks (K5)', () => {
  it('Record: a nav named by its label, one link per entry in order, aria-current only on the current one', () => {
    renderWithProviders(<TabLinks label="Main office sections" links={RECORD} />);
    const nav = screen.getByRole('navigation', { name: 'Main office sections' });
    const links = [...nav.querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toEqual(['Detail', 'In use', 'Change log']);
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual(['page', null, null]);
  });

  it('RecordInUseCurrent: currentHref wins over the pathname and is matched exactly', () => {
    renderWithProviders(
      <TabLinks
        label="Main office sections"
        links={RECORD}
        currentHref="/setup/cost-centers/7/in-use"
      />,
    );
    expect(screen.getByRole('link', { name: 'In use' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Detail' }).getAttribute('aria-current')).toBeNull();
  });

  it('a Node link is a next/link anchor; a legacy one a plain <a> with the 12px glyph and the hidden "opens in Perfex"', () => {
    const { container } = renderWithProviders(<TabLinks label="Settings" links={SETTINGS} />);
    const staff = screen.getByRole('link', { name: 'Staff' });
    expect(staff.hasAttribute('data-next-link')).toBe(true);
    const general = screen.getByRole('link', { name: `General ${SHELL.opens_in_perfex}` });
    expect(general.hasAttribute('data-next-link')).toBe(false);
    expect(general.getAttribute('href')).toBe('/admin/settings?group=general');
    const glyph = general.querySelector('[data-icon-name="external-link"]');
    expect(glyph).not.toBeNull();
    expect(classes(glyph)).toContain('size-3');
    // One in the row (the invisible measuring copy draws its own, aria-hidden).
    expect(
      container.querySelector('ul')?.querySelectorAll('[data-icon-name="external-link"]'),
    ).toHaveLength(1);
    expect(screen.getByText(SHELL.opens_in_perfex).className).toContain('sr-only');
  });

  it('renders no link whose href does not start with exactly one slash (T-4.2-44)', () => {
    renderWithProviders(
      <TabLinks
        label="Main office sections"
        links={[
          { id: 'ok', label: 'Detail', href: '/setup/cost-centers/7' },
          { id: 'proto', label: 'Proto', href: '//evil.example' },
          { id: 'back', label: 'Back', href: '/\\evil.example' },
          { id: 'abs', label: 'Abs', href: 'https://x' },
          { id: 'js', label: 'Js', href: 'javascript:alert(1)' },
          { id: 'rel', label: 'Rel', href: 'in-use' },
        ]}
      />,
    );
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Detail']);
  });

  it('horizontal: 36px links with 16px inline padding, 8px apart, a 1px border under the row; the current one weight 600 with a 2px foreground underline', () => {
    renderWithProviders(<TabLinks label="Main office sections" links={RECORD} />);
    const nav = screen.getByRole('navigation');
    expect(classes(nav)).toEqual(expect.arrayContaining(['flex', 'border-b']));
    // relative: the sr-only text of a legacy link stays inside the clipping row (no page overflow);
    // the row never scrolls: what does not fit goes to More.
    expect(classes(nav.querySelector('ul'))).toEqual(
      expect.arrayContaining(['relative', 'overflow-hidden', 'flex', 'gap-2', 'min-w-0', 'flex-1']),
    );
    expect(classes(nav.querySelector('ul'))).not.toContain('overflow-x-auto');
    const current = screen.getByRole('link', { name: 'Detail' });
    expect(classes(current)).toEqual(
      expect.arrayContaining(['h-9', 'px-4', 'border-b-2', 'border-foreground', 'font-semibold']),
    );
    const other = screen.getByRole('link', { name: 'In use' });
    expect(classes(other)).toEqual(expect.arrayContaining(['border-transparent']));
    expect(classes(other)).not.toContain('font-semibold');
    expect(classes(other)).not.toContain('border-foreground');
  });

  it('SettingsNav: one horizontal row at every width (no column, no md: classes); the current tab weight 600 with the underline', () => {
    pathname.value = '/setup/staff';
    renderWithProviders(<TabLinks label="Settings" links={TABS} more={PERFEX} />);
    const nav = screen.getByRole('navigation');
    const all = [nav, ...nav.querySelectorAll('*')].flatMap((node) => classes(node));
    expect(all.filter((name) => name.startsWith('md:'))).toEqual([]);
    expect(all).not.toContain('flex-col');
    const current = screen.getByRole('link', { name: 'Staff' });
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(classes(current)).toEqual(
      expect.arrayContaining(['h-9', 'font-semibold', 'border-b-2', 'border-foreground']),
    );
  });

  it('More: the more entries are not tabs; a "More" button (chevron-down) after the row opens a menu of links in order, the Perfex ones with the glyph and "opens in Perfex"', async () => {
    renderWithProviders(<TabLinks label="Settings" links={TABS} more={PERFEX} />);
    const nav = screen.getByRole('navigation');
    const row = nav.querySelector('ul');
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Staff', 'Roles']);
    const more = within(nav).getByRole('button', { name: COMMON.more });
    expect(more.querySelector('[data-icon-name="chevron-down"]')).not.toBeNull();
    // Outside the clipping row, at its inline end: always in reach.
    expect(row?.contains(more)).toBe(false);
    expect(nav.lastElementChild).toBe(more);
    await userEvent.click(more);
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      `General${SHELL.opens_in_perfex}`,
      `Localization${SHELL.opens_in_perfex}`,
    ]);
    expect(items.map((item) => item.getAttribute('href'))).toEqual([
      '/admin/settings?group=general',
      '/admin/settings?group=localization',
    ]);
    expect(items[0]?.tagName).toBe('A');
    expect(items[0]?.hasAttribute('data-next-link')).toBe(false);
    expect(items[0]?.querySelector('[data-icon-name="external-link"]')).not.toBeNull();
    expect(more.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('More: no button without more entries, and a more href that is not a same-origin path is dropped (T-4.2-44)', () => {
    const { unmount } = renderWithProviders(<TabLinks label="Settings" links={TABS} />);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    renderWithProviders(
      <TabLinks
        label="Settings"
        links={TABS}
        more={[{ id: 'evil', label: 'Evil', href: '//evil.example', legacy: true }]}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  describe('priority overflow (quick 261003-ovf): a ResizeObserver on the row, never the window', () => {
    beforeEach(() => {
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      FakeResizeObserver.current = null;
    });

    it('fits all: every tab in the row, in order, and no More without entries', () => {
      renderWithProviders(<TabLinks label="Main office sections" links={RECORD} />);
      resize({
        row: 400,
        more: 80,
        tabs: { Detail: 100, 'In use': 140, 'Change log': 120 },
      });
      const nav = screen.getByRole('navigation');
      expect(rowLabels(nav)).toEqual(['Detail', 'In use', 'Change log']);
      expect(within(nav).queryByRole('button')).toBeNull();
    });

    it('fits all beside More: the tabs stay, More holds only its own entries', async () => {
      pathname.value = '/setup/staff';
      renderWithProviders(
        <TabLinks
          label="Settings"
          links={FIVE.slice(0, 3)}
          more={LOCALIZATION}
          moreLeading={GENERAL}
        />,
      );
      resize(FIVE_SIZES);
      const nav = screen.getByRole('navigation');
      expect(rowLabels(nav)).toEqual(['Staff', 'Roles', 'Taxes']);
      expect(await menuLabels(nav)).toEqual([
        `General${SHELL.opens_in_perfex}`,
        `Localization${SHELL.opens_in_perfex}`,
      ]);
    });

    it('overflow moves the tail into More, after moreLeading and before more (the page order), still links', async () => {
      pathname.value = '/setup/staff';
      renderWithProviders(
        <TabLinks label="Settings" links={FIVE} more={LOCALIZATION} moreLeading={GENERAL} />,
      );
      resize(FIVE_SIZES);
      const nav = screen.getByRole('navigation');
      expect(rowLabels(nav)).toEqual(['Staff', 'Roles', 'Taxes']);
      expect(await menuLabels(nav)).toEqual([
        `General${SHELL.opens_in_perfex}`,
        'Currencies',
        'Samples',
        `Localization${SHELL.opens_in_perfex}`,
      ]);
      const currencies = screen.getByRole('menuitem', { name: 'Currencies' });
      expect(currencies.tagName).toBe('A');
      expect(currencies.hasAttribute('data-next-link')).toBe(true);
      expect(currencies.getAttribute('href')).toBe('/setup/currencies');
    });

    it("the current tab is kept: past the room, it takes the last shown tab's place", async () => {
      pathname.value = '/setup/samples';
      renderWithProviders(<TabLinks label="Settings" links={FIVE} />);
      resize(FIVE_SIZES);
      const nav = screen.getByRole('navigation');
      expect(rowLabels(nav)).toEqual(['Staff', 'Roles', 'Samples']);
      expect(within(nav).getByRole('link', { name: 'Samples' }).getAttribute('aria-current')).toBe(
        'page',
      );
      expect(await menuLabels(nav)).toEqual(['Taxes', 'Currencies']);
    });

    it('a wide current tab takes as many places as it needs', () => {
      pathname.value = '/setup/samples';
      renderWithProviders(<TabLinks label="Settings" links={FIVE} />);
      resize({ ...FIVE_SIZES, tabs: { ...FIVE_SIZES.tabs, Samples: 200 } });
      expect(rowLabels(screen.getByRole('navigation'))).toEqual(['Staff', 'Samples']);
    });

    it('a wider row brings the tabs back and drops the empty More', () => {
      pathname.value = '/setup/staff';
      renderWithProviders(<TabLinks label="Settings" links={FIVE} />);
      resize(FIVE_SIZES);
      const nav = screen.getByRole('navigation');
      expect(within(nav).getByRole('button', { name: COMMON.more })).toBeTruthy();
      resize({ ...FIVE_SIZES, row: 600 });
      expect(rowLabels(nav)).toEqual(['Staff', 'Roles', 'Taxes', 'Currencies', 'Samples']);
      expect(within(nav).queryByRole('button')).toBeNull();
    });

    it('the measuring copy is invisible, aria-hidden and holds no text (nothing read twice)', () => {
      renderWithProviders(<TabLinks label="Settings" links={FIVE} more={LOCALIZATION} />);
      const copy = screen.getByRole('navigation').firstElementChild;
      expect(copy?.getAttribute('aria-hidden')).toBe('true');
      expect(classes(copy)).toEqual(
        expect.arrayContaining(['invisible', 'absolute', 'size-0', 'overflow-hidden']),
      );
      expect(copy?.textContent).toBe('');
      expect(
        [...(copy?.querySelectorAll('[data-tab-measure]') ?? [])].map((node) =>
          node.getAttribute('data-label'),
        ),
      ).toEqual(['Staff', 'Roles', 'Taxes', 'Currencies', 'Samples']);
    });

    it('Rtl: the same split from the same logical sizes under ar, and no physical-direction class', async () => {
      pathname.value = '/setup/staff';
      const { container } = renderWithProviders(
        <TabLinks label="Settings" links={FIVE} more={LOCALIZATION} moreLeading={GENERAL} />,
        { locale: 'ar' },
      );
      resize(FIVE_SIZES);
      const nav = screen.getByRole('navigation');
      expect(rowLabels(nav)).toEqual(['Staff', 'Roles', 'Taxes']);
      expect(physicalClassesIn(container)).toEqual([]);
      await userEvent.click(within(nav).getByRole('button', { name: COMMON_AR.more }));
      const menu = await screen.findByRole('menu');
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .map((item) => item.getAttribute('href')),
      ).toEqual([
        '/admin/settings?group=general',
        '/setup/currencies',
        '/setup/samples',
        '/admin/settings?group=localization',
      ]);
    });
  });

  it('a tab link clicked while a dirty form is mounted is intercepted by the unsaved-changes guard', async () => {
    function DirtyDetail(): ReactElement {
      const guard = useUnsavedChanges(true);
      return (
        <>
          <TabLinks label="Main office sections" links={RECORD} />
          <output data-testid="pending">{guard.pendingHref ?? 'none'}</output>
        </>
      );
    }
    renderWithProviders(<DirtyDetail />);
    await userEvent.click(screen.getByRole('link', { name: 'In use' }));
    expect(screen.getByTestId('pending').textContent).toBe('/setup/cost-centers/7/in-use');
  });

  it('Rtl: no physical-direction class under ar', () => {
    const { container } = renderWithProviders(
      <TabLinks label={COMMON.record_sections} links={TABS} more={PERFEX} />,
      { locale: 'ar' },
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
