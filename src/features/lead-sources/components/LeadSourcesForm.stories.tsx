import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { toSupportedLocale, type Locale } from '@/i18n/locales';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { seedRow } from '@/lib/api/row-seed';
import { setSession } from '@/lib/auth/session';
import commonAr from '@/messages/common/ar.json';
import commonEn from '@/messages/common/en.json';
import ar from '../messages/ar.json';
import en from '../messages/en.json';
import { LeadSourcesForm } from './LeadSourcesForm';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;
const NO_USE = {
  leads: 0,
  emailIntegrations: 0,
  webToLeadForms: 0,
};
const RECORD = {
  id: 'a1',
  name: 'Google Ads',
  usage: NO_USE,
};

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';

const problem = (status: number, code: string, issues?: unknown): Answer => ({
  status,
  body: { type: 'about:blank', status, title: code, code, ...(issues ? { issues } : {}) },
});

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

function withApi(
  save: Answer = { status: HTTP_OK, body: RECORD },
  read: Answer = { status: HTTP_OK, body: RECORD },
): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    const adapter: ApiAdapter = (config) =>
      respond(config, (config.method ?? 'get').toUpperCase() === 'GET' ? read : save);
    http.defaults.adapter = adapter;
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const meta = {
  title: 'Features/LeadSources/LeadSourcesForm',
  component: LeadSourcesForm,
  args: { id: null },
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/lead-sources/new' } },
  },
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LeadSourcesForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function typeAndSubmit(root: HTMLElement, submit = 'Create lead source'): Promise<void> {
  const canvas = within(root);
  await userEvent.type(
    await canvas.findByRole('textbox', { name: /^Source Name/ }),
    'LinkedIn Campaign',
  );
  await userEvent.click(canvas.getByRole('button', { name: submit }));
}

async function confirmSummary(): Promise<void> {
  const dialog = await within(document.body).findByTestId('confirm-dialog');
  const confirm = within(dialog).getByTestId('confirm-dialog-confirm');
  await waitFor(async () => {
    await expect(getComputedStyle(confirm).pointerEvents).not.toBe('none');
  });
  await userEvent.click(confirm);
}

export const Default: Story = { decorators: [withApi()] };

const EDIT = {
  args: { id: 'a1' },
  parameters: { nextjs: { navigation: { pathname: '/setup/lead-sources/a1' } } },
} as const;

export const Edit: Story = { ...EDIT, decorators: [withApi()] };

export const SaveSummary: Story = {
  ...EDIT,
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = await canvas.findByRole('textbox', { name: /^Source Name/ });
    await waitFor(async () => {
      await expect(name).toHaveValue('Google Ads');
    });
    await userEvent.clear(name);
    await userEvent.type(name, 'LinkedIn Campaign');
    await userEvent.click(canvas.getByRole('button', { name: 'Save lead source' }));
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    await waitFor(async () => {
      await expect(dialog).toBeVisible();
    });
    const changes = within(dialog).getByTestId('confirm-dialog-changes');
    await expect(changes).toHaveTextContent('Source Name: Google Ads → LinkedIn Campaign');
  },
};

export const Loading: Story = {
  ...EDIT,
  decorators: [withApi(undefined, 'pending')],
};

export const Mobile: Story = {
  ...EDIT,
  decorators: [withApi()],
  parameters: {
    ...EDIT.parameters,
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

export const Pending: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement);
    await confirmSummary();
    const buttons = await within(document.body).findAllByRole('button', {
      name: 'Creating lead source…',
    });
    for (const button of buttons) await expect(button).toBeDisabled();
  },
};

export const FieldErrors: Story = {
  decorators: [
    withApi(
      problem(HTTP_BAD_REQUEST, 'ERP-VALIDATION-0001', [
        { path: ['name'], message: 'server text, never rendered' },
      ]),
    ),
  ],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement);
    await confirmSummary();
    const summary = await within(canvasElement).findByTestId('error-summary');
    await waitFor(async () => {
      await expect(summary).toHaveFocus();
    });
  },
};

export const ServerError: Story = {
  decorators: [withApi(problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'))],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement);
    await confirmSummary();
    await waitFor(async () => {
      await expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
    });
    const alert = await within(canvasElement).findByTestId('form-server-error');
    await expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

export const SaveRefusedDeleted: Story = {
  args: { id: 'a1' },
  decorators: [withApi(problem(HTTP_NOT_FOUND, 'ERP-CORE-0004'))],
  parameters: {
    nextjs: { navigation: { pathname: '/setup/lead-sources/a1' } },
  },
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement, 'Save lead source');
    await confirmSummary();
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    const error = await within(dialog).findByTestId('confirm-dialog-error');
    await expect(error.textContent).toBe(en['lead-sources'].errors['ERP-CORE-0004']);
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

export const EditFromList: Story = {
  args: { id: 'a1' },
  decorators: [
    function SeedRowDecorator(Story) {
      setSession({ accessToken: 'story', csrfToken: 'story' });
      http.defaults.adapter = (config) => respond(config, 'pending');
      seedRow('/api/v1/lead-sources/a1', RECORD);
      return <Story />;
    },
  ],
  parameters: {
    nextjs: { navigation: { pathname: '/setup/lead-sources/a1' } },
  },
  play: async ({ canvasElement }) => {
    const box = await within(canvasElement).findByRole('textbox', { name: /^Source Name/ });
    await expect(box).toHaveValue('Google Ads');
  },
};

const TEXTS: Record<Locale, { readonly notFound: string; readonly back: string }> = {
  en: { notFound: en['lead-sources'].errors['ERP-CORE-0004'], back: commonEn.common.back_to_list },
  ar: { notFound: ar['lead-sources'].errors['ERP-CORE-0004'], back: commonAr.common.back_to_list },
};
const RETURN_KEY = 'erp.list.return:/setup/lead-sources';

async function expectNotFound(root: HTMLElement, locale: unknown, href: string): Promise<void> {
  const texts = TEXTS[toSupportedLocale(locale)];
  const error = await within(root).findByTestId('inline-error');
  await expect(error).toHaveTextContent(texts.notFound);
  await expect(within(root).queryByRole('button')).toBeNull();
  const links = within(root).getAllByRole('link');
  await expect(links).toHaveLength(1);
  await expect(links[0]).toHaveAccessibleName(texts.back);
  await expect(links[0]).toHaveAttribute('href', href);
}

export const NotFound: Story = {
  args: { id: 'gone' },
  decorators: [
    withApi({ status: HTTP_OK, body: RECORD }, problem(HTTP_NOT_FOUND, 'ERP-CORE-0004')),
  ],
  parameters: { nextjs: { navigation: { pathname: '/setup/lead-sources/gone' } } },
  beforeEach: () => {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ url: '/setup/lead-sources?q=go' }));
    return () => {
      sessionStorage.removeItem(RETURN_KEY);
    };
  },
  play: async ({ canvasElement, globals }) => {
    await expectNotFound(canvasElement, globals.locale, '/setup/lead-sources?q=go');
  },
};

export const SeededNotFound: Story = {
  args: { id: 's4' },
  decorators: [
    function SeedDecorator(Story) {
      setSession({ accessToken: 'story', csrfToken: 'story' });
      const read = problem(HTTP_NOT_FOUND, 'ERP-CORE-0004');
      http.defaults.adapter = (config) => respond(config, read);
      seedRow('/api/v1/lead-sources/s4', { ...RECORD, id: 's4' });
      return <Story />;
    },
  ],
  parameters: { nextjs: { navigation: { pathname: '/setup/lead-sources/s4' } } },
  beforeEach: () => {
    sessionStorage.removeItem(RETURN_KEY);
  },
  play: async ({ canvasElement, globals }) => {
    await expectNotFound(canvasElement, globals.locale, '/setup/lead-sources');
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull();
  },
};

export const Rtl: Story = { decorators: [withApi()], globals: { locale: 'ar' } };
