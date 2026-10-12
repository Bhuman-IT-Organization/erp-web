import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type {
  CurrenciesRow,
  CurrenciesUsage,
} from '@/features/currencies/schemas/currencies.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { CurrenciesList } from './CurrenciesList';

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
const IN_USE = 'ERP-CURRENCIES-0001';

const NO_USE: CurrenciesUsage = {
  invoices: 0,
  expenses: 0,
  proposals: 0,
  estimates: 0,
  customers: 0,
  creditNotes: 0,
  subscriptions: 0,
  purchaseOrders: 0,
  purchaseRequests: 0,
  purchaseQuotations: 0,
  purchaseInvoices: 0,
  debitNotes: 0,
  fafRequests: 0,
  vendors: 0,
  goodsReceipts: 0,
  goodsDeliveries: 0,
  packingLists: 0,
  orderReturns: 0,
  fixedEquipmentCarts: 0,
  payslipsFrom: 0,
  payslipsTo: 0,
  purchaseConvertedFrom: 0,
  purchaseConvertedTo: 0,
  fixedEquipmentLocations: 0,
};

/** One currency at its quiet defaults (nothing uses it, not the base, can become the base). */
const currency = (
  id: string,
  name: string,
  symbol: string,
  extra: Partial<CurrenciesRow> = {},
): CurrenciesRow => ({
  id,
  name,
  symbol,
  decimalSeparator: '.',
  thousandSeparator: ',',
  placement: 'before',
  isBase: false,
  usage: NO_USE,
  lockUsage: { exchangeRates: 0, exchangeRateLogs: 0, payslipCodes: 0 },
  registeredUsage: {},
  canMakeBase: true,
  ...extra,
});

/**
 * The code descends, as the api orders it. "USD" is the base; "EUR" is used by 2 invoices and 1
 * payslip paid in it; "JPY" only by 3 registered uses of another module; "SAR" cannot
 * become the base (the current base has transactions); two rows share the code "AED" (Perfex
 * accepts it); "GBP" and the rest are unused.
 */
const NAMED: readonly CurrenciesRow[] = [
  currency('1', 'USD', '$', { isBase: true, canMakeBase: false }),
  currency('2', 'SAR', 'SR', { canMakeBase: false }),
  currency('3', 'JPY', 'JP¥', { registeredUsage: { samples: 3 } }),
  currency('4', 'GBP', '£'),
  currency('5', 'EUR', '€', { usage: { ...NO_USE, invoices: 2, payslipsTo: 1 } }),
  currency('6', 'AED', 'AED'),
  currency('7', 'AED', 'Dh'),
];
const rows = (count: number): CurrenciesRow[] =>
  Array.from(
    { length: count },
    (_, i) => NAMED[i] ?? currency(String(i + 1), `C${String(i + 1).padStart(2, '0')}`, 'c'),
  );

const listPage = (data: readonly CurrenciesRow[], total = data.length) => ({
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

/** `/me` answers an administrator; a DELETE answers `remove`, the make-base `base`; the list `list`. */
function api(
  list: Answer,
  remove: Answer = { status: HTTP_NO_CONTENT },
  base: Answer = { status: HTTP_OK, body: { id: '4', isBase: true } },
): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0] ?? '';
    const method = (config.method ?? 'get').toUpperCase();
    if (path === '/api/v1/auth/me') return respond(config, { status: HTTP_OK, body: ADMIN });
    if (method === 'DELETE') return respond(config, remove);
    if (method === 'PATCH') return respond(config, base);
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

/** The inline actions exist from `md`; a story that clicks one declares a desktop width. */
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

const openDelete = async (canvasElement: HTMLElement, code = 'GBP'): Promise<HTMLElement> => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: `Delete currency ${code}` }));
  return page(canvasElement).findByTestId('confirm-dialog');
};

const openMakeBase = async (canvasElement: HTMLElement, code = 'GBP'): Promise<HTMLElement> => {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole('button', { name: `Make ${code} the base currency` }),
  );
  return page(canvasElement).findByTestId('confirm-dialog');
};

/** The refusal shows from the moment the dialog opens, and its confirm is disabled. */
async function expectRefusedUpFront(dialog: HTMLElement, text: string): Promise<void> {
  await waitFor(async () => {
    await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
  });
  await expect(within(dialog).getByTestId('confirm-dialog-error')).toHaveTextContent(text);
  await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
}

const meta = {
  title: 'Features/Currencies/CurrenciesList',
  component: CurrenciesList,
  // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/currencies' } },
  },
  decorators: [withApi(api(LOADED))],
} satisfies Meta<typeof CurrenciesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** FE-27 `Loading`: the first answer is unknown: the list skeleton, and no message (D-39). */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** FE-27 `Empty`: nothing yet and no search: the heading, the body and New Currency (D-30). */
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

/**
 * FE-27 `Loaded`: 25 of 60, the code descending: Currency Code (the link) and Symbol, then Edit,
 * Make base currency and Delete per row (no Make base on the base row); no checkbox; two rows with
 * the code "AED".
 */
export const Loaded: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: 'Make GBP the base currency' }),
    ).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Make USD the base currency' })).toBeNull();
  },
};

/** Perfex's base label under the base row's code ("USD", then "Base Currency" in small muted text). */
export const BaseRow: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const labels = await within(canvasElement).findAllByTestId('currency-base');
    await expect(labels).toHaveLength(1);
    await expect(labels[0]).toHaveTextContent('Base Currency');
  },
};

/** A currency nothing uses: "Delete currency GBP?", Keep / Delete in red. */
export const DeleteConfirm: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await waitFor(async () => {
      await expect(within(dialog).getByRole('heading')).toHaveTextContent('Delete currency GBP?');
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/**
 * A currency the row says is used (2 invoices, 1 payslip paid in it): one line per group, the
 * refusal from the start and Delete disabled; no request is sent (D-40).
 */
export const DeleteInUse: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, 'EUR');
    await expectRefusedUpFront(dialog, 'still in use');
    await expect(dialog).toHaveTextContent('2 invoices use this currency.');
    await expect(dialog).toHaveTextContent('1 payslip is paid in this currency.');
  },
};

/** The base currency: the refusal from the start (make another currency the base first). */
export const DeleteBase: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, 'USD');
    await expectRefusedUpFront(dialog, 'base currency');
  },
};

/** A currency only another module's registered uses use (D-41): the line and the refusal. */
export const DeleteRegisteredUse: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, 'JPY');
    await expectRefusedUpFront(dialog, 'Another part of the application');
    await expect(dialog).toHaveTextContent(
      '3 records elsewhere in the application use this currency.',
    );
  },
};

/**
 * The race: the list said nothing used the currency, the api answers 409. The reason stays inside,
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

/** Make base currency asks first (a recorded UX addition: Perfex's star changed it in one click, D-39). */
export const MakeBaseConfirm: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openMakeBase(canvasElement);
    await waitFor(async () => {
      await expect(within(dialog).getByRole('heading')).toHaveTextContent(
        'Make GBP the base currency?',
      );
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/** A currency that cannot become the base: Perfex's rule as the refusal from the start, nothing sent. */
export const MakeBaseRefused: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openMakeBase(canvasElement, 'SAR');
    await expectRefusedUpFront(dialog, 'transactions');
  },
};

/** At 375 px: the code and the symbol, and the "Actions for ..." kebab. */
export const Mobile: Story = { ...MOBILE };

/** Arabic: the page mirrors; the actions stay main first, destructive last. */
export const Rtl: Story = { globals: { locale: 'ar' } };
