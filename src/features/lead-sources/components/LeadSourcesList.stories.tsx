import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type {
  LeadSourcesRow,
  LeadSourcesUsage,
} from '@/features/lead-sources/schemas/lead-sources.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { LeadSourcesList } from './LeadSourcesList';

const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_CONFLICT = 409;
const HTTP_SERVICE_UNAVAILABLE = 503;
const TOTAL = 40;
const PAGE = 25;
const EXPORT_LIMIT = 10_000;
const PRINT_LIMIT = 1_000;
const IN_USE = 'ERP-LEADSOURCES-0001';

const NAMES = [
  'Google Ads',
  'LinkedIn Campaign',
  'Organic Search',
  'Referral',
  'Direct Traffic',
  'Cold Outreach',
  'Trade Show',
  'Partner Network',
  'Webinar',
  'Other',
];

const NO_USE: LeadSourcesUsage = {
  leads: 0,
  emailIntegrations: 0,
  webToLeadForms: 0,
};

const rows = (count: number): LeadSourcesRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(TOTAL - i),
    name: i < NAMES.length ? (NAMES[i] ?? 'Other') : `Lead Source ${String(TOTAL - i)}`,
    usage: i === 0 ? { ...NO_USE, leads: 14, emailIntegrations: 3, webToLeadForms: 1 } : NO_USE,
  }));

const listPage = (data: readonly LeadSourcesRow[], total = data.length) => ({
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

const page = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

async function clickWhenReady(element: HTMLElement): Promise<void> {
  await waitFor(async () => {
    await expect(getComputedStyle(element).pointerEvents).not.toBe('none');
  });
  await userEvent.click(element);
}

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

const UNUSED_NAME = 'Other';
const USED_NAME = 'Google Ads';

const openDelete = async (canvasElement: HTMLElement, name = UNUSED_NAME): Promise<HTMLElement> => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: `Delete lead source ${name}` }));
  return page(canvasElement).findByTestId('confirm-dialog');
};

const meta = {
  title: 'Features/LeadSources/LeadSourcesList',
  component: LeadSourcesList,
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/lead-sources' } },
  },
  decorators: [withApi(api(LOADED))],
} satisfies Meta<typeof LeadSourcesList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = { decorators: [withApi(api('pending'))] };

export const Empty: Story = { decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))] };

export const NoResults: Story = {
  decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))],
  parameters: { nuqs: { searchParams: '?q=zz' } },
};

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

export const Loaded: Story = {};

export const DeleteConfirm: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await waitFor(async () => {
      await expect(within(dialog).getByRole('heading')).toHaveTextContent(
        'Delete lead source Other?',
      );
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

export const DeleteInUse: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, USED_NAME);
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(dialog).toHaveTextContent('14 leads use this lead source.');
    await expect(dialog).toHaveTextContent('3 email integrations use this lead source.');
    await expect(dialog).toHaveTextContent('1 web-to-lead form uses this lead source.');
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

export const DeleteRefused: Story = {
  ...DESKTOP,
  decorators: [
    withApi(api(LOADED, { status: HTTP_CONFLICT, body: problem(HTTP_CONFLICT, IN_USE) })),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

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

export const Mobile: Story = { ...MOBILE };

export const Rtl: Story = { globals: { locale: 'ar' } };
