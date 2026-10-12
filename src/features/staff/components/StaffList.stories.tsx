import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { StaffMember } from '@/features/staff/schemas/staff.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { StaffList } from './StaffList';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache per story and the tab's session seeded (a
// request is held until the session is known, WR-08). Fixture data only (W0-05, T-3.2-70): never
// the live stack, whose database is a copy of production.
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_SERVICE_UNAVAILABLE = 503;
const TOTAL = 1240;
const PAGE = 25;
const EXPORT_LIMIT = 10_000;

const FIRST = ['Ada', 'Grace', 'Alan', 'Katherine', 'Edsger', 'Barbara', 'Donald', 'Frances'];
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Johnson', 'Dijkstra', 'Liskov', 'Knuth', 'Allen'];
const ROLES = ['Support', 'Finance', null, 'Warehouse Supervisor'];

/** A neutral photo drawn inline — a `data:` URI, never a file (check:brand allows it in stories). */
const photo = (size: number): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${String(size)}' height='${String(size)}'><rect width='100%' height='100%' fill='silver'/><circle cx='50%' cy='40%' r='22%' fill='gray'/><circle cx='50%' cy='100%' r='38%' fill='gray'/></svg>`,
  )}`;
const THUMB = photo(96);
const PREVIEW = photo(320);

const people = (count: number): StaffMember[] =>
  Array.from({ length: count }, (_, i) => {
    const first = FIRST[i % FIRST.length] ?? 'Ada';
    // Unique for 25 rows: row i and row i + 8 never share a surname.
    const last = LAST[(i * 3 + Math.floor(i / FIRST.length)) % LAST.length] ?? 'Lovelace';
    const hasPhoto = i % 3 !== 2;
    return {
      staffId: i + 1,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${String(i + 1)}@example.invalid`,
      firstName: first,
      lastName: last,
      phoneNumber: null,
      profileImageUrl: hasPhoto ? THUMB : null,
      profileImagePreviewUrl: hasPhoto ? PREVIEW : null,
      isAdmin: false,
      roleId: null,
      roleName: ROLES[i % ROLES.length] ?? null,
      active: i % 5 !== 4,
      dateCreated: '2026-01-02T20:30:00.000Z',
      lastLogin:
        i % 4 === 3 ? null : `2026-09-${String(10 + (i % 15)).padStart(2, '0')}T08:30:00.000Z`,
    };
  });

const listPage = (rows: readonly StaffMember[], total = rows.length) => ({
  data: rows,
  meta: {
    nextCursor: rows.length < total ? 'next' : null,
    prevCursor: null,
    total,
    rangeStart: rows.length === 0 ? 0 : 1,
    exportLimit: EXPORT_LIMIT,
  },
});

const ADMIN = {
  staffId: 99,
  email: 'admin@example.invalid',
  firstName: 'Admin',
  lastName: 'Person',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: null,
};

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';

const LOADED: Answer = { status: HTTP_OK, body: listPage(people(PAGE), TOTAL) };

function respond(config: InternalAxiosRequestConfig, answer: Answer) {
  if (answer === 'pending') return new Promise<never>(() => undefined);
  const response = {
    data: answer.body,
    status: answer.status,
    statusText: String(answer.status),
    headers: new AxiosHeaders(),
    config,
  };
  if (answer.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

/** `/me` answers an administrator; a status write answers 204; the list answers `list`. */
function api(list: Answer): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0] ?? '';
    if (path === '/api/v1/auth/me') return respond(config, { status: HTTP_OK, body: ADMIN });
    if (path.endsWith('/status')) return respond(config, { status: HTTP_NO_CONTENT });
    return respond(config, list);
  };
}

function withApi(adapter: ApiAdapter): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = adapter;
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const meta = {
  title: 'Features/Staff/StaffList',
  component: StaffList,
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff' } } },
  decorators: [withApi(api(LOADED))],
} satisfies Meta<typeof StaffList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The first answer is unknown: the list skeleton with the photo column, and no message (D-39). */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** No member yet and no search: "No staff members yet" with the create button (D-30). */
export const Empty: Story = { decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))] };

/** A search that matches nobody: the query named, and Clear search (D-30). */
export const NoResults: Story = {
  decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))],
  parameters: { nuqs: { searchParams: '?q=zz' } },
};

/** A retryable failure: plain language where the table goes, with Retry (D-31, D-32). */
export const Error: Story = {
  decorators: [
    withApi(
      api({
        status: HTTP_SERVICE_UNAVAILABLE,
        body: {
          type: 'about:blank',
          status: HTTP_SERVICE_UNAVAILABLE,
          title: 'x',
          code: 'ERP-UPSTREAM-0001',
        },
      }),
    ),
  ],
};

/** 25 of 1,240: photo, name, e-mail, role, last login, the Active switch and the brand View. */
export const Loaded: Story = {};

/** Switching an active member off asks first: "Deactivate …?" with Keep active / Deactivate member. */
export const DeactivateConfirm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('switch', { name: 'Active for Ada Lovelace' }));
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    await waitFor(async () => {
      await expect(within(dialog).getByRole('heading')).toHaveTextContent(
        'Deactivate Ada Lovelace?',
      );
    });
  },
};

/** Below `md`: Email, Role and Last login fold away; the View button folds into the kebab. */
export const Mobile: Story = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

/** Arabic: the page mirrors; the e-mail keeps its left-to-right order in <bdi>. */
export const Rtl: Story = { globals: { locale: 'ar' } };
