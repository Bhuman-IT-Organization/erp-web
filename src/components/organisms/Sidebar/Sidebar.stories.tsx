import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { Sidebar } from './Sidebar';

const OK = 200;
/** Longer than the sheet primitive's 200 ms exit animation (`duration-200`). */
const PAST_SHEET_ANIMATION_MS = 600;
/** The width below which the sidebar primitive renders the drawer (`use-mobile`, 768 px). */
const BELOW_MD = '(max-width: 767px)';

/**
 * The sidebar filters by `GET /api/v1/auth/me`. Each story answers that request from a NAMED
 * decorator on the shared axios instance — never `src/test/axios-fakes.ts`, which imports `vi`.
 * `/me` is asked only once the tab's session is signed in (WR-08), so each decorator seeds one.
 */
function withMe(
  isAdmin: boolean,
  permissions: readonly string[],
  { trigger = false }: { readonly trigger?: boolean } = {},
): Decorator {
  return function MeDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = (config) =>
      Promise.resolve({
        data: {
          staffId: 1,
          email: 'someone@example.com',
          firstName: 'Example',
          lastName: 'Person',
          isAdmin,
          roleId: null,
          permissions: [...permissions],
          locale: null,
        },
        status: OK,
        statusText: 'OK',
        headers: {},
        config,
      });
    return (
      <SidebarProvider>
        {trigger ? <SidebarTrigger /> : null}
        <Story />
      </SidebarProvider>
    );
  };
}

const meta = {
  title: 'Organisms/Sidebar',
  component: Sidebar,
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff' } } },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An administrator: `canAny` short-circuits, so every row is visible. */
export const Admin: Story = { decorators: [withMe(true, [])] };

/** A member holding one code: only that row and the ungated ones. */
export const Member: Story = { decorators: [withMe(false, ['accounting.banking.view'])] };

/** While `/me` is in flight the menu is its own skeleton: no row and no message (D-39). */
export const Loading: Story = {
  decorators: [
    function PendingMe(Story) {
      setSession({ accessToken: 'story', csrfToken: 'story' });
      http.defaults.adapter = () => new Promise(() => undefined);
      return (
        <SidebarProvider>
          <Story />
        </SidebarProvider>
      );
    },
  ],
};

/**
 * The search box is on screen only at desktop width (below `md` the menu is a closed drawer, which
 * `MobileSearchEscape` opens), so the two search stories declare a desktop viewport.
 */
const DESKTOP = {
  parameters: {
    viewport: {
      options: {
        desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' } },
      },
    },
  },
  globals: { viewport: { value: 'desktop1280', isRotated: false } },
} satisfies Pick<Story, 'parameters' | 'globals'>;

/** Search covers both panels: "setting" finds rows under Main Menu and under Setup Menu (D-38). */
export const Searching: Story = {
  ...DESKTOP,
  decorators: [withMe(true, [])],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByTestId('menu-search'), 'setting');
    await expect(await canvas.findByTestId('setup-menu')).toBeInTheDocument();
  },
};

/** Nothing matches: the line names the query and offers Clear search. */
export const NoMatch: Story = {
  ...DESKTOP,
  decorators: [withMe(true, [])],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByTestId('menu-search'), 'zzqx');
    await expect(await canvas.findByTestId('menu-no-match')).toBeInTheDocument();
  },
};

/**
 * An administrator on a nested Setup route (D-16): the Setup panel shows, Finance is open and
 * Expenses Categories is marked (`aria-current="page"`, the inline-start marker), with no click on
 * the menu. Below `md` the menu is a closed drawer, so the play opens it first (it portals to
 * `<body>`); the audit at 375 px then covers the drawer on the same route.
 */
export const NestedSetupRoute: Story = {
  decorators: [withMe(true, [], { trigger: true })],
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/expense-categories/new' } },
  },
  play: async ({ canvasElement }) => {
    if (window.matchMedia(BELOW_MD).matches) {
      await userEvent.click(
        await within(canvasElement).findByRole('button', { name: 'Toggle Sidebar' }),
      );
    }
    const page = within(document.body);
    await expect(await page.findByTestId('setup-menu')).toBeInTheDocument();
    await expect(page.getByTestId('nav-expenses-categories')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByTestId('nav-finance').closest('details')).toHaveAttribute('open');
  },
};

/** The same nested route under `ar`: docked on the right, the marker on the inline start. */
export const NestedSetupRouteRtl: Story = {
  ...NestedSetupRoute,
  globals: { locale: 'ar' },
};

/** Docked on the right, the inline start in Arabic. */
export const Rtl: Story = { decorators: [withMe(true, [])], globals: { locale: 'ar' } };

/**
 * Below `md` the menu is a drawer. The first Esc in a non-empty search clears it and the drawer stays
 * open; the next Esc, on the empty box, closes the drawer (lead 2026-09-26).
 */
export const MobileSearchEscape: Story = {
  decorators: [withMe(true, [], { trigger: true })],
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
  play: async () => {
    // The drawer is portalled to <body>, outside the story's canvas.
    const page = within(document.body);
    await userEvent.click(await page.findByRole('button', { name: 'Toggle Sidebar' }));
    const box = await page.findByTestId('menu-search');
    const drawer = page.getByRole('dialog');
    await userEvent.type(box, 'staff');
    await userEvent.keyboard('{Escape}');
    await expect(box).toHaveValue('');
    // A closing drawer stays mounted through its exit animation, so "still visible" proves nothing:
    // wait past the animation, then the drawer must still be OPEN.
    await new Promise((resolve) => setTimeout(resolve, PAST_SHEET_ANIMATION_MS));
    await expect(drawer).toHaveAttribute('data-state', 'open');
    await userEvent.keyboard('{Escape}');
    await waitFor(async () => {
      await expect(page.queryByRole('dialog')).toBeNull();
    });
  },
};

/**
 * The marked row stays in view (UAT 4.2 gap 3): at `/setup/cost-centers` the Cost Centers row sits
 * low in the main menu, near the bottom of a long menu. It scrolls itself into the menu's own scroll
 * area, above the Setup Menu footer, on load; the page itself never scrolls.
 */
function costCentersMarked(width: number, height: number): Story {
  const value = `desktop${String(width)}x${String(height)}`;
  return {
    decorators: [withMe(true, [])],
    parameters: {
      nextjs: { appDirectory: true, navigation: { pathname: '/setup/cost-centers' } },
      viewport: {
        options: {
          [value]: {
            name: `Desktop ${String(width)} x ${String(height)}`,
            styles: { width: `${String(width)}px`, height: `${String(height)}px` },
          },
        },
      },
    },
    globals: { viewport: { value, isRotated: false } },
    play: async ({ canvasElement }) => {
      const page = within(canvasElement);
      await expect(await page.findByTestId('main-menu')).toBeInTheDocument();
      const marked = canvasElement.querySelector<HTMLElement>('[aria-current="page"]');
      if (marked === null) throw new Error('no marked row');
      const area = canvasElement.querySelector('[data-sidebar="content"]');
      const footer = canvasElement.querySelector('[data-sidebar="footer"]');
      if (area === null || footer === null) throw new Error('no scroll area or footer');
      await waitFor(async () => {
        const row = marked.getBoundingClientRect();
        await expect(row.top).toBeGreaterThanOrEqual(area.getBoundingClientRect().top - 0.5);
        await expect(row.bottom).toBeLessThanOrEqual(footer.getBoundingClientRect().top + 0.5);
      });
      await expect(window.scrollY).toBe(0);
    },
  };
}

/** 1366 x 768, the smallest laptop the lead checks: Cost Centers marked and in view. */
export const CostCentersMarked1366 = costCentersMarked(1366, 768);

/** 1920 x 1080, the lead's screen from the UAT screenshot. */
export const CostCentersMarked1920 = costCentersMarked(1920, 1080);
