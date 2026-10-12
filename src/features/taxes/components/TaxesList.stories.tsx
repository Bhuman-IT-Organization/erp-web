import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { TaxesRow, TaxesUsage } from '@/features/taxes/schemas/taxes.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { TaxesList } from './TaxesList';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache per story and the tab's session seeded (a
// request is held until the session is known). Fixture data only (W0-05): never the live stack.
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_CONFLICT = 409;
const HTTP_SERVICE_UNAVAILABLE = 503;
const TOTAL = 60;
const PAGE = 25;
const EXPORT_LIMIT = 10_000;
const PRINT_LIMIT = 1_000;
const IN_USE = 'ERP-TAXES-0001';

const NAMES = [
  'VAT',
  'Fuel < 50 km',
  'Zero',
  'Reduced',
  'Service',
  'GST',
  'Excise',
  'Customs',
  'Luxury',
  'Tourism',
];
const NO_USE: TaxesUsage = {
  items: 0,
  expenses: 0,
  subscriptions: 0,
  vendorItems: 0,
  purchaseLines: 0,
  warehouseLines: 0,
  fixedEquipmentLines: 0,
  salesReturnLines: 0,
  accounting: 0,
};

/** "VAT" is used by 2 items and 1 purchase line; the rest by nothing. The rate ascends, as the api orders it. */
const rows = (count: number): TaxesRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: i < NAMES.length ? (NAMES[i] ?? 'VAT') : `Tax ${String(i + 1)}`,
    rate: `${String(i)}.${i % 2 === 0 ? '00' : '50'}`,
    usage: i === 0 ? { ...NO_USE, items: 2, purchaseLines: 1 } : NO_USE,
    isDefault: false,
  }));

const listPage = (data: readonly TaxesRow[], total = data.length) => ({
  data,
  meta: {
    nextCursor: data.length < total ? 'next' : null,
    prevCursor: null,
    total,
    rangeStart: data.length === 0 ? 0 : 1,
    exportLimit: EXPORT_LIMIT,
    printLimit: PRINT_LIMIT,
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

const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: 'x',
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

/** `/me` answers an administrator; a DELETE answers `remove`; the list answers `list`. */
function api(list: Answer, remove: Answer = { status: HTTP_NO_CONTENT }): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0] ?? '';
    if (path === '/api/v1/auth/me') return respond(config, { status: HTTP_OK, body: ADMIN });
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

const LOADED: Answer = { status: HTTP_OK, body: listPage(rows(PAGE), TOTAL) };

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

/** "Zero" is used by nothing; "VAT" by items and a purchase line. */
const UNUSED_NAME = 'Zero';
const USED_NAME = 'VAT';

const openDelete = async (canvasElement: HTMLElement, name = UNUSED_NAME): Promise<HTMLElement> => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: `Delete tax ${name}` }));
  return page(canvasElement).findByTestId('confirm-dialog');
};

const meta = {
  title: 'Features/Taxes/TaxesList',
  component: TaxesList,
  // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/taxes' } },
  },
  decorators: [withApi(api(LOADED))],
} satisfies Meta<typeof TaxesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** FE-27 `Loading`: the first answer is unknown: the list skeleton, and no message (D-39). */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** FE-27 `Empty`: nothing yet and no search: the heading, the body and New Tax (D-30). */
export const Empty: Story = { decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))] };

/** A search that matches nothing: the query named, and Clear search (D-30). */
export const NoResults: Story = {
  decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))],
  parameters: { nuqs: { searchParams: '?q=zz' } },
};

/** FE-27 `Error`: a retryable failure in plain language where the table goes, with Retry (D-31, D-32). */
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

/** FE-27 `Loaded`: 25 of 60, rate ascending: ID, Tax Name (the link) and Rate (percent); no checkbox. */
export const Loaded: Story = {};

/** A tax nothing uses: "Delete tax Zero?", Keep / Delete in red. */
export const DeleteConfirm: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await waitFor(async () => {
      await expect(within(dialog).getByRole('heading')).toHaveTextContent('Delete tax Zero?');
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/**
 * A tax the row says is used (2 items, 1 purchase line): one line per group, the refusal from the
 * start and Delete disabled; no request is sent (D-07).
 */
export const DeleteInUse: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, USED_NAME);
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(dialog).toHaveTextContent('2 items use this tax.');
    await expect(dialog).toHaveTextContent('1 purchase line uses this tax.');
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/**
 * The race: the list said nothing used the tax, the api answers 409. The reason stays inside,
 * Delete is disabled, and the list pages ask again (UAT 7, UI-SPEC G8).
 */
export const DeleteRefused: Story = {
  ...DESKTOP,
  decorators: [
    withApi(api(LOADED, { status: HTTP_CONFLICT, body: problem(HTTP_CONFLICT, IN_USE) })),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
    // The dialog fades in over 100 ms; the answer can land while it is still translucent.
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/** A network failure: the human message inside the dialog, Delete still enabled to retry (D-29). */
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

/** At 375 px: ID, Tax Name, Rate and the "Actions for …" kebab; the toolbar wraps. */
export const Mobile: Story = { ...MOBILE };

/** Arabic: the page mirrors; the actions stay main first, destructive last; the ID keeps its digits. */
export const Rtl: Story = { globals: { locale: 'ar' } };
