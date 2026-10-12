import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { expect, within } from 'storybook/test';
import type { ApiAdapter } from '@/lib/api/call-api';
import { forgetLegacySession } from '@/lib/auth/legacy-session';
import { clearSession } from '@/lib/auth/session';
import { LoginResume } from './LoginResume';

// The same seams the tests use: a fake transport, a no-op navigation and an in-memory
// sessionStorage, so nothing in Storybook leaves the page or touches the real tab's storage.
const noopNavigate = (): void => undefined;
const failedHandoff = (): Promise<boolean> => Promise.resolve(false);
const memory = new Map<string, string>();
const memoryStorage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
};

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const CSRF_URL = '/api/v1/auth/csrf';

/** A transport that never answers: the card stays in its skeleton. */
const pendingAdapter: ApiAdapter = () => new Promise(() => undefined);

/** csrf answers a token; refresh answers `status` with `body` (a problem-details body when it fails). */
function refreshAdapter(status: number, body: unknown): ApiAdapter {
  return (config: InternalAxiosRequestConfig) => {
    const ok = config.url === CSRF_URL || status === HTTP_OK;
    const response = {
      data: config.url === CSRF_URL ? { csrfToken: 'story-csrf' } : body,
      status: config.url === CSRF_URL ? HTTP_OK : status,
      statusText: String(status),
      headers: new AxiosHeaders(),
      config,
    };
    return ok
      ? Promise.resolve(response)
      : Promise.reject(
          new AxiosError(
            `Request failed with status code ${String(status)}`,
            'ERR_BAD_REQUEST',
            config,
            null,
            response,
          ),
        );
  };
}

const meta = {
  title: 'Features/Auth/LoginResume',
  component: LoginResume,
  args: { next: '/admin/', navigate: noopNavigate, route: noopNavigate, storage: memoryStorage },
  // LoginResume reads the app router (a Node `next` is entered through it); `route` stubs the push.
  parameters: { nextjs: { appDirectory: true } },
  // The session store and the shared handoff flight are module state shared by every story.
  beforeEach: () => {
    clearSession();
    forgetLegacySession();
    memory.clear();
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md">
        <div className="rounded-lg border border-solid border-neutral-600/20 bg-white px-6 py-8 shadow-sm sm:px-8">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof LoginResume>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What a signed-in member sees on `/login` while the api is asked: the card's skeleton (D-39). */
export const Checking: Story = {
  args: { adapter: pendingAdapter },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('login-resume-pending')).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByTestId('login-form')).toBeNull();
  },
};

/** The same under `ar`. */
export const Rtl: Story = {
  ...Checking,
  globals: { locale: 'ar' },
};

/** A stale flag: the refresh is refused (401 ERP-AUTH-0002), so the form shows and stays. */
export const StaleCookie: Story = {
  args: {
    adapter: refreshAdapter(HTTP_UNAUTHORIZED, {
      type: 'about:blank',
      status: HTTP_UNAUTHORIZED,
      title: 'ERP-AUTH-0002',
      code: 'ERP-AUTH-0002',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId('login-form')).toBeVisible();
    await expect(canvas.queryByRole('alert')).toBeNull();
  },
};

/** A live session whose handoff failed: the existing message with Retry, no navigation. */
export const HandoffFailed: Story = {
  args: {
    adapter: refreshAdapter(HTTP_OK, { accessToken: 'story-access', csrfToken: 'story-csrf-2' }),
    handoff: failedHandoff,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('alert')).toBeVisible();
    await expect(canvas.getByTestId('handoff-retry')).toBeVisible();
  },
};
