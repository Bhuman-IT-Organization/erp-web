import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, screen, userEvent, within } from 'storybook/test';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { AccountMenu } from './AccountMenu';

const OK = 200;

/**
 * The menu reads `GET /api/v1/auth/me` through `usePermissions`. A NAMED decorator answers it on the
 * shared axios instance — never `src/test/axios-fakes.ts`, which imports `vi` — after seeding a
 * signed-in session, because `/me` is asked only then (WR-08).
 */
const withMe: Decorator = function MeDecorator(Story) {
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
    <div className="flex justify-end p-4">
      <Story />
    </div>
  );
};

const meta = {
  title: 'Organisms/AccountMenu',
  component: AccountMenu,
  decorators: [withMe],
  args: { writeLocale: () => undefined },
} satisfies Meta<typeof AccountMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The initials circle and, from `md` up, the first name. */
export const Default: Story = {};

/** While `/me` is in flight: the 32 px circle and a 64 px bar, no name and no menu (D-39). */
export const Loading: Story = {
  decorators: [
    function PendingMe(Story) {
      setSession({ accessToken: 'story', csrfToken: 'story' });
      http.defaults.adapter = () => new Promise(() => undefined);
      return <Story />;
    },
  ],
};

/** Opened, with the Language sub-menu showing each locale in its own language. */
export const LanguageOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByTestId('account-menu'));
    await userEvent.click(await screen.findByTestId('account-language'));
    // Portalled and animated in: assert presence, not visibility.
    await expect(await screen.findByTestId('locale-ar')).toBeInTheDocument();
  },
};

/** At the inline end in Arabic; the sub-menu opens toward the inline end (DirectionProvider). */
export const Rtl: Story = { globals: { locale: 'ar' } };
