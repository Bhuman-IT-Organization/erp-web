import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { SIDEBAR_ID } from '@/components/organisms/Sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { Topbar } from './Topbar';

const OK = 200;

/**
 * `Topbar` reads the sidebar context `PageShell` mounts, and its account menu reads `/me`; a lone
 * story supplies both (a signed-in session first, WR-08).
 */
function withShell(open: boolean): Decorator {
  return function ShellDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = (config) =>
      Promise.resolve({
        data: {
          staffId: 7,
          email: 'jane.doe@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
          isAdmin: false,
          roleId: null,
          permissions: [],
          locale: null,
        },
        status: OK,
        statusText: 'OK',
        headers: {},
        config,
      });
    return (
      <SidebarProvider defaultOpen={open}>
        <div className="w-full border-b">
          <Story />
        </div>
        {/* The toggle's `aria-controls` must resolve: alone, the Topbar has no sidebar to point at. */}
        <div id={SIDEBAR_ID} />
      </SidebarProvider>
    );
  };
}

const meta = {
  title: 'Organisms/Topbar',
  component: Topbar,
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff' } } },
  args: { writeLocale: () => undefined },
} satisfies Meta<typeof Topbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The hamburger, the breadcrumbs and the one account menu — nothing else (D-09). */
export const Default: Story = { decorators: [withShell(true)] };

/** The desktop sidebar hidden: the hamburger reads `aria-expanded="false"`. */
export const SidebarClosed: Story = { decorators: [withShell(false)] };

export const Rtl: Story = { decorators: [withShell(true)], globals: { locale: 'ar' } };
