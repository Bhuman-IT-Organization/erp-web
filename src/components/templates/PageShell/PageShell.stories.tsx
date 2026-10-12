import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactElement } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { InlineError } from '@/components/molecules/InlineError';
import { ApiUnreachableBanner } from '@/components/organisms/ApiUnreachableBanner';
import { markUnreachable } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { useBreadcrumbLabel } from '@/lib/hooks/use-breadcrumb-label';
import { shellViewport } from '@/test/in-shell';
import { PageShell } from './PageShell';

const OK = 200;

/** A signed-in session is seeded so the shell does not bootstrap and the menu asks `/me` (WR-08). */
const withMe: Decorator = function MeDecorator(Story) {
  setSession({ accessToken: 'story', csrfToken: 'story' });
  http.defaults.adapter = (config) =>
    Promise.resolve({
      data: {
        staffId: 1,
        email: 'someone@example.com',
        firstName: 'Example',
        lastName: 'Person',
        isAdmin: true,
        roleId: null,
        permissions: [],
        locale: null,
      },
      status: OK,
      statusText: 'OK',
      headers: {},
      config,
    });
  return <Story />;
};

const meta = {
  title: 'Templates/PageShell',
  component: PageShell,
  decorators: [withMe],
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff' } } },
  args: { children: <p data-testid="page-content">Page content goes here.</p> },
} satisfies Meta<typeof PageShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithBrand: Story = {
  args: { brand: <span data-testid="brand-stub">Example Company</span> },
};

/**
 * A neutral logo of a given shape, drawn inline (a `data:` URI, never a file — check:brand allows it
 * in stories only). The circle makes a distortion visible: stretched, it would read as an ellipse.
 */
function logo(width: number, height: number): React.ReactElement {
  const r = Math.min(width, height) / 2;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${String(width)}' height='${String(height)}'><rect width='100%' height='100%' fill='gray'/><circle cx='${String(r)}' cy='${String(height / 2)}' r='${String(r)}' fill='white'/></svg>`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a story's neutral inline logo, as BrandLogo renders the customer's
    <img
      src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
      alt="Example Company"
      data-testid="brand-logo"
    />
  );
}

/** A wide logo (4:1) keeps its shape: 128 × 32 at the start of the header, never 272 × 32. */
export const WideLogo: Story = { args: { brand: logo(400, 100) } };

/** A square logo (1:1) stays square: 32 × 32. */
export const SquareLogo: Story = { args: { brand: logo(100, 100) } };

/** A tall logo (1:2) stays tall: 16 × 32. */
export const TallLogo: Story = { args: { brand: logo(60, 120) } };

/** A member who hid the sidebar: the `sidebar_state` cookie read by the layout says `false`. */
export const SidebarClosed: Story = { args: { defaultOpen: false } };

/** The sidebar docks on the right, the inline start in Arabic. */
export const Rtl: Story = {
  args: { brand: <span data-testid="brand-stub">Example Company</span> },
  globals: { locale: 'ar' },
};

const LINES = 60;

/**
 * A long page scrolled down: the header (toggle, breadcrumb, account menu) stays at the top of the
 * viewport on its solid background, above the content (UAT 3).
 */
export const Scrolled: Story = {
  args: {
    children: (
      <div data-testid="page-content">
        {Array.from({ length: LINES }, (_, index) => (
          <p key={index} className="py-2">
            Line {index + 1} of the page content.
          </p>
        ))}
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const view = doc.defaultView ?? window;
    view.scrollTo(0, 600);
    await waitFor(async () => {
      await expect(view.scrollY).toBeGreaterThan(0);
      await expect(doc.querySelector('[data-page-header]')?.getBoundingClientRect().top).toBe(0);
    });
  },
};

/** A detail page whose record cannot be loaded: it names no record, so the breadcrumb stops waiting. */
function MissingRecordPage(): ReactElement {
  useBreadcrumbLabel(null);
  return (
    <InlineError
      message="That record no longer exists."
      back={{ href: '/setup/staff', label: 'Back to list' }}
    />
  );
}

/** `/setup/staff/999999`: the leaf reads the record placeholder, never a skeleton that never ends (D-39). */
export const RecordNotFound: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff/999999' } } },
  args: { children: <MissingRecordPage /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvasElement.querySelector('[data-testid="breadcrumb-skeleton"]')).toBeNull();
      await expect(
        canvasElement.querySelector('[aria-current="page"]')?.textContent.trim(),
      ).toBeTruthy();
    });
    await expect(canvas.getAllByTestId('inline-error')).toHaveLength(1);
  },
};

/**
 * The api is unreachable (lead 2026-10-07): rendered as `app/layout.tsx` does, the root banner
 * before the shell. The one banner a member sees sits in the content column, never under the
 * sidebar, so its first words read whole; the sidebar is on the inline start in either direction.
 */
function unreachable(locale?: 'ar'): Story {
  const viewport = shellViewport(1280);
  return {
    ...viewport,
    ...(locale === undefined ? {} : { globals: { ...viewport.globals, locale } }),
    decorators: [
      (Story) => (
        <>
          <ApiUnreachableBanner />
          <Story />
        </>
      ),
    ],
    play: async ({ canvasElement }) => {
      const doc = canvasElement.ownerDocument;
      // After the shell's /me answered (an answer marks the api reachable), the api goes away.
      await waitFor(async () => {
        await expect(within(canvasElement).getByText('Page content goes here.')).toBeVisible();
      });
      markUnreachable(null);
      const visible = (): HTMLElement[] =>
        [...doc.querySelectorAll<HTMLElement>('[data-testid="api-unreachable"]')].filter(
          (banner) => banner.getClientRects().length > 0,
        );
      await waitFor(async () => {
        await expect(visible()).toHaveLength(1);
      });
      const shown = visible();
      const banner = shown[0]?.getBoundingClientRect();
      const sidebar = doc.querySelector('[data-slot="sidebar-container"]')?.getBoundingClientRect();
      await expect(banner).toBeDefined();
      await expect(sidebar).toBeDefined();
      if (banner === undefined || sidebar === undefined) return;
      if (locale === 'ar') await expect(banner.right).toBeLessThanOrEqual(sidebar.left + 1);
      else await expect(banner.left).toBeGreaterThanOrEqual(sidebar.right - 1);
    },
  };
}

export const ApiUnreachable: Story = unreachable();
export const ApiUnreachableRtl: Story = unreachable('ar');
