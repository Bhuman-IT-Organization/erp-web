import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type {
  PaymentModesRow,
  PaymentModesUsage,
} from '@/features/payment-modes/schemas/payment-modes.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { PaymentModesList } from './PaymentModesList';

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
const IN_USE = 'ERP-PAYMENTMODES-0001';

const NAMES = [
  'Bank transfer',
  'Cash',
  'Cash < 50',
  'Cheque',
  'Cheque',
  'Credit card',
  'Mobile wallet',
  'Petty cash',
  'Spare',
  'Wire',
];
const NO_USE: PaymentModesUsage = {
  invoicePayments: 0,
  expenses: 0,
  creditNoteRefunds: 0,
  purchaseInvoicePayments: 0,
  purchaseOrderPayments: 0,
  debitNoteRefunds: 0,
  fixedEquipmentRefunds: 0,
  orderReturnRefunds: 0,
};

/**
 * The name ascends, as the api orders it. "Bank transfer" has a two-line description and is used by
 * 2 invoice payments and 1 order return refund; "Cash" is switched off; "Credit card" is the credit
 * expense mode (D-37); two rows share the name "Cheque" (Perfex accepts it); the rest are unused.
 */
const rows = (count: number): PaymentModesRow[] =>
  Array.from({ length: count }, (_, i) => {
    const name = i < NAMES.length ? (NAMES[i] ?? 'Spare') : `Payment mode ${String(i + 1)}`;
    return {
      id: String(i + 1),
      name,
      description: i === 0 ? 'Bank: First Bank\nIBAN: AE00 0000 0000 0000' : '',
      active: name !== 'Cash',
      showOnPdf: i === 0,
      selectedByDefault: false,
      invoicesOnly: false,
      expensesOnly: false,
      usage: i === 0 ? { ...NO_USE, invoicePayments: 2, orderReturnRefunds: 1 } : NO_USE,
      isCreditExpenseMode: name === 'Credit card',
    };
  });

const listPage = (data: readonly PaymentModesRow[], total = data.length) => ({
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

/** `/me` answers an administrator; a DELETE answers `remove`, the switch `active`; the list `list`. */
function api(
  list: Answer,
  remove: Answer = { status: HTTP_NO_CONTENT },
  active: Answer = { status: HTTP_OK, body: { id: '1', active: false } },
): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0] ?? '';
    const method = (config.method ?? 'get').toUpperCase();
    if (path === '/api/v1/auth/me') return respond(config, { status: HTTP_OK, body: ADMIN });
    if (method === 'DELETE') return respond(config, remove);
    if (method === 'PATCH') return respond(config, active);
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

/** "Spare" is used by nothing; "Bank transfer" by 2 invoice payments and 1 order return refund. */
const UNUSED_NAME = 'Spare';
const USED_NAME = 'Bank transfer';
const CREDIT_NAME = 'Credit card';

const openDelete = async (canvasElement: HTMLElement, name = UNUSED_NAME): Promise<HTMLElement> => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: `Delete payment mode ${name}` }));
  return page(canvasElement).findByTestId('confirm-dialog');
};

const meta = {
  title: 'Features/PaymentModes/PaymentModesList',
  component: PaymentModesList,
  // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/payment-modes' } },
  },
  decorators: [withApi(api(LOADED))],
} satisfies Meta<typeof PaymentModesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** FE-27 `Loading`: the first answer is unknown: the list skeleton, and no message (D-39). */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** FE-27 `Empty`: nothing yet and no search: the heading, the body and New Payment Mode (D-30). */
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
 * FE-27 `Loaded`: 25 of 60, the name ascending, under Perfex's announcement line: ID, Payment Mode
 * Name (the link), the description (both lines of "Bank transfer" kept) and the Active switch
 * ("Cash" off); no checkbox; two rows named "Cheque".
 */
export const Loaded: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId('payment-modes-announcement')).toBeVisible();
    await expect(await canvas.findByRole('switch', { name: 'Active: Cash' })).not.toBeChecked();
  },
};

/** A payment mode nothing uses: "Delete payment mode Spare?", Keep / Delete in red. */
export const DeleteConfirm: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await waitFor(async () => {
      await expect(within(dialog).getByRole('heading')).toHaveTextContent(
        'Delete payment mode Spare?',
      );
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/**
 * A payment mode the row says is used (2 invoice payments, 1 order return refund): one line per
 * group, the refusal pointing to the Active switch from the start and Delete disabled; no request is
 * sent (D-33).
 */
export const DeleteInUse: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, USED_NAME);
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(dialog).toHaveTextContent('2 invoice payments use this payment mode.');
    await expect(dialog).toHaveTextContent('1 order return refund uses this payment mode.');
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/**
 * The credit expense mode Perfex's `expense_credit_payment_mode` names: the refusal from the start
 * (expenses use it to mark a credit expense; switch it off instead) and Delete disabled (D-37).
 */
export const DeleteCreditMode: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, CREDIT_NAME);
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-error')).toHaveTextContent(
      'credit expense',
    );
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/**
 * The race: the list said nothing used the payment mode, the api answers 409. The reason stays
 * inside, Delete is disabled, and the list pages ask again (UAT 7, UI-SPEC G8).
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

/**
 * The one-click switch fails (a 503): the switch is back where it was and "Not saved. Try again."
 * shows beside it; nothing else moves (D-34, ADR-0031: a write is never retried by itself).
 */
export const SwitchFailed: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api(
        LOADED,
        { status: HTTP_NO_CONTENT },
        {
          status: HTTP_SERVICE_UNAVAILABLE,
          body: problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
        },
      ),
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole('switch', { name: `Active: ${USED_NAME}` });
    await userEvent.click(toggle);
    const cell = toggle.parentElement;
    if (cell === null) throw new globalThis.Error('no Active cell');
    await expect(await within(cell).findByRole('status')).toHaveTextContent(
      'Not saved. Try again.',
    );
    await expect(toggle).toBeChecked();
  },
};

/** At 375 px: ID, Payment Mode Name, Active and the "Actions for ..." kebab (the description hidden). */
export const Mobile: Story = { ...MOBILE };

/** Arabic: the page mirrors; the actions stay main first, destructive last; the ID keeps its digits. */
export const Rtl: Story = { globals: { locale: 'ar' } };
