import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type {
  ContractTypes,
  ContractTypeUsage,
} from '@/features/contract-types/schemas/contract-types.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { ContractTypesList } from './ContractTypesList';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache per story and the tab's session seeded (a
// request is held until the session is known). Fixture data only (W0-05): never the live stack.
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_SERVICE_UNAVAILABLE = 503;
const TOTAL = 60;
const PAGE = 25;
const EXPORT_LIMIT = 10_000;
const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];

const NO_USE: ContractTypeUsage = {
  contracts: 0,
  goals: 0,
};

/** "Alpha 1" is used by nothing; "Beta 2" by 3 contracts and 1 goal. */
const UNUSED_NAME = 'Alpha 1';
const USED_NAME = 'Beta 2';

const rows = (count: number): ContractTypes[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `r${String(i + 1)}`,
    name: `${NAMES[i % NAMES.length] ?? 'Alpha'} ${String(i + 1)}`,
    usage: i === 1 ? { contracts: 3, goals: 1 } : NO_USE,
  }));

const listPage = (data: readonly ContractTypes[], total = data.length) => ({
  data,
  meta: {
    nextCursor: data.length < total ? 'next' : null,
    prevCursor: null,
    total,
    rangeStart: data.length === 0 ? 0 : 1,
    exportLimit: EXPORT_LIMIT,
  },
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

function api(list: Answer, remove: Answer = { status: HTTP_NO_CONTENT }): ApiAdapter {
  return (config: InternalAxiosRequestConfig) => {
    if ((config.method ?? 'get').toUpperCase() === 'DELETE') return respond(config, remove);
    return respond(config, list);
  };
}

function withApi(list: Answer, remove?: Answer): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = api(list, remove);
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

const openDelete = async (canvasElement: HTMLElement, name = UNUSED_NAME): Promise<HTMLElement> => {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole('button', { name: `Delete contract type ${name}` }),
  );
  return page(canvasElement).findByTestId('confirm-dialog');
};

const meta = {
  title: 'Features/ContractTypes/ContractTypesList',
  component: ContractTypesList,
  // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/contract-types' } },
  },
  decorators: [withApi(LOADED)],
} satisfies Meta<typeof ContractTypesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** FE-27 `Loading`: the first answer is unknown: the list skeleton, and no message (D-39). */
export const Loading: Story = { decorators: [withApi('pending')] };

/** FE-27 `Empty`: nothing yet and no search: the heading, the body and the create button (D-30). */
export const Empty: Story = { decorators: [withApi({ status: HTTP_OK, body: listPage([]) })] };

/** A search that matches nothing: the query named, and Clear search (D-30). */
export const NoResults: Story = {
  decorators: [withApi({ status: HTTP_OK, body: listPage([]) })],
  parameters: { nuqs: { searchParams: '?q=zz' } },
};

/** FE-27 `Error`: a retryable failure in plain language where the table goes, with Retry (D-31, D-32). */
export const Error: Story = {
  decorators: [
    withApi({
      status: HTTP_SERVICE_UNAVAILABLE,
      body: {
        type: 'about:blank',
        status: HTTP_SERVICE_UNAVAILABLE,
        title: 'x',
        code: 'ERP-UPSTREAM-0001',
      },
    }),
  ],
};

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

/** FE-27 `Loaded`: 25 of 60: Name links to the record and sorts; Created in the customer's format. */
export const Loaded: Story = {};

/** A contract type nothing uses: "Delete contract type Alpha 1?", Keep / Delete in red. */
export const DeleteConfirm: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await waitFor(async () => {
      await expect(within(dialog).getByRole('heading')).toHaveTextContent(
        'Delete contract type Alpha 1?',
      );
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/**
 * A contract type the row says is used (3 contracts, 1 goal): one line per group, the refusal
 * from the start and Delete disabled; no request is sent (D-07, D-28).
 */
export const DeleteInUse: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, USED_NAME);
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(dialog).toHaveTextContent('3 contracts use this contract type.');
    await expect(dialog).toHaveTextContent('1 goal uses this contract type.');
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/** Mobile: 375px viewport. */
export const Mobile: Story = { ...MOBILE };

/** Arabic: the page mirrors; the pager and the toolbar follow the inline direction. */
export const Rtl: Story = { globals: { locale: 'ar' } };
