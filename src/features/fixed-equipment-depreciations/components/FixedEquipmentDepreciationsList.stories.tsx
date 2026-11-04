import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { PERMISSIONS } from '@/config/permissions';
import type { FixedEquipmentDepreciationsRow } from '@/features/fixed-equipment-depreciations/schemas/fixed-equipment-depreciations.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import en from '../messages/en.json';
import { FixedEquipmentDepreciationsList } from './FixedEquipmentDepreciationsList';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache per story and the tab's session seeded.
// Fixture data only (W0-05): never the live stack.
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_SERVICE_UNAVAILABLE = 503;
const EN = en['fixed-equipment-depreciations'];
const CODES = PERMISSIONS.fixedEquipment.settingDepreciation;

/**
 * Perfex's two sample depreciations, two more, one old row stored without a term (its Term cell
 * reads "None") and one Arabic name (the name rules accept any character).
 */
const ROWS: readonly FixedEquipmentDepreciationsRow[] = [
  { id: '1', name: 'Depreciation 1', term: 12 },
  { id: '2', name: 'Depreciation 2', term: 36 },
  { id: '3', name: 'Straight line', term: 60 },
  { id: '4', name: 'Legacy', term: null },
  { id: '5', name: 'إهلاك ثابت', term: 24 },
];

const listPage = (data: readonly FixedEquipmentDepreciationsRow[]) => ({
  data,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: data.length,
    rangeStart: data.length === 0 ? 0 : 1,
    exportLimit: 10_000,
    printLimit: 1_000,
  },
});

const member = (isAdmin: boolean, permissions: readonly string[] = []) => ({
  staffId: 99,
  email: 'member@example.invalid',
  firstName: 'Some',
  lastName: 'Member',
  isAdmin,
  roleId: null,
  permissions,
  locale: null,
});
const ADMIN = member(true);
/** A member who may read every depreciation and change none: Perfex hides Add, Edit and Delete. */
const VIEW_ONLY = member(false, [CODES.view]);

const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
});

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';

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

function api(
  list: Answer,
  remove: Answer = { status: HTTP_NO_CONTENT },
  me: unknown = ADMIN,
): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0] ?? '';
    if (path === '/api/v1/auth/me') return respond(config, { status: HTTP_OK, body: me });
    if ((config.method ?? 'get').toUpperCase() === 'DELETE') return respond(config, remove);
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

const LOADED: Answer = { status: HTTP_OK, body: listPage(ROWS) };
const EMPTY: Answer = { status: HTTP_OK, body: listPage([]) };

/** The dialog portals to `<body>`, outside the story canvas. */
const page = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

/** Radix disables pointer events on <body> while the modal mounts: click once the dialog takes input. */
async function clickWhenReady(element: HTMLElement): Promise<void> {
  await waitFor(async () => {
    await expect(getComputedStyle(element).pointerEvents).not.toBe('none');
  });
  await userEvent.click(element);
}

/** The inline Delete exists from `md`; a story that clicks it declares a desktop width. */
const DESKTOP = {
  parameters: {
    viewport: {
      options: {
        desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' } },
      },
    },
  },
  globals: { viewport: { value: 'desktop1280', isRotated: false } },
} as const;

const MOBILE = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
} as const;

/** The row of the link with this name: a role, not a translated text. */
const rowOf = async (canvasElement: HTMLElement, name: string): Promise<HTMLElement> => {
  const link = await within(canvasElement).findByRole('link', { name });
  const tr = link.closest('tr');
  if (tr === null) throw new globalThis.Error(`no row for ${name}`);
  return tr;
};

/** Opens the delete of a row: its inline actions' destructive button (a test id and a role). */
const openDelete = async (
  canvasElement: HTMLElement,
  name = 'Depreciation 1',
): Promise<HTMLElement> => {
  const row = await rowOf(canvasElement, name);
  const actions = await within(row).findByTestId('row-actions-inline');
  const buttons = within(actions).getAllByRole('button');
  const remove = buttons.at(-1);
  if (remove === undefined) throw new globalThis.Error('no delete button');
  await userEvent.click(remove);
  return page(canvasElement).findByTestId('confirm-dialog');
};

const meta = {
  title: 'Features/FixedEquipmentDepreciations/FixedEquipmentDepreciationsList',
  component: FixedEquipmentDepreciationsList,
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/setup/fixed-equipment-depreciations' },
    },
  },
  decorators: [withApi(api(LOADED))],
} satisfies Meta<typeof FixedEquipmentDepreciationsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `Loading`: the first answer is unknown: the list skeleton, and no message. */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** `Empty`: nothing yet and no search: "no depreciations found", the body and Add. */
export const Empty: Story = { decorators: [withApi(api(EMPTY))] };

/** A search that matches nothing: the query named, and Clear search. */
export const NoResults: Story = {
  decorators: [withApi(api(EMPTY))],
  parameters: { nuqs: { searchParams: '?q=zz' } },
};

/** `Error`: a retryable failure in plain language where the table goes, with Retry. */
export const Error: Story = {
  decorators: [
    withApi(
      api({
        status: HTTP_SERVICE_UNAVAILABLE,
        body: problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
      }),
    ),
  ],
};

/** `Loaded`: Perfex's three columns, ID, Name (the link) and Term (one plural message); Edit and Delete on each row. */
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const table = await canvas.findByTestId('list-table');
    await expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    await expect(within(table).getAllByRole('row')).toHaveLength(ROWS.length + 1);
    await expect(canvas.getByRole('link', { name: 'Straight line' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'إهلاك ثابت' })).toBeVisible();
  },
};

/** A member holding only `view`: the rows read, with no Add, no Edit and no Delete, as in Perfex. */
export const ViewOnly: Story = {
  decorators: [withApi(api(LOADED, undefined, VIEW_ONLY))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = await rowOf(canvasElement, 'Straight line');
    await waitFor(async () => {
      await expect(within(row).queryByTestId('row-actions-inline')).toBeNull();
    });
    await expect(canvas.queryByRole('link', { name: EN.add })).toBeNull();
  },
};

/** The delete dialog: Keep / Delete in red, nothing sent until confirmed. */
export const DeleteConfirm: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
    await expect(within(dialog).queryByTestId('confirm-dialog-error')).toBeNull();
  },
};

/** Still in use: the api answers 409 `ERP-FIXEDEQUIPMENTDEPRECIATIONS-0001`, shown inside the dialog; Delete disabled. */
export const DeleteRefused: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api(LOADED, {
        status: HTTP_CONFLICT,
        body: problem(HTTP_CONFLICT, 'ERP-FIXEDEQUIPMENTDEPRECIATIONS-0001'),
      }),
    ),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, 'Straight line');
    await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/** Deleted by someone else meanwhile: the api answers 404 `ERP-CORE-0004`, shown inside the dialog. */
export const DeleteNotFound: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api(LOADED, { status: HTTP_NOT_FOUND, body: problem(HTTP_NOT_FOUND, 'ERP-CORE-0004') }),
    ),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, 'Straight line');
    await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
  },
};

/** A network failure: the human message inside the dialog, Delete still enabled to retry. */
export const DeleteRetryable: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api(LOADED, {
        status: HTTP_SERVICE_UNAVAILABLE,
        body: problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-NETWORK-0001'),
      }),
    ),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/** At 375 px: all three columns show, with the ⋮ actions on each row; the toolbar wraps. */
export const Mobile: Story = { ...MOBILE };

/** Arabic: the page mirrors; each Term in its Arabic plural form; the actions stay main first, destructive last. */
export const Rtl: Story = { globals: { locale: 'ar' } };
