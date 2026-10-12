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
import { TaxesForm } from './TaxesForm';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, a private SWR cache per story and the tab's session seeded. A GET
// answers the record; a POST or PATCH answers `save`. Fixture data only (W0-05).
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_SERVICE_UNAVAILABLE = 503;
const NO_USE = {
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
const RECORD = { id: 'a1', name: 'Alpha', rate: '5.00', usage: NO_USE, isDefault: false };

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
  title: 'Features/Taxes/TaxesForm',
  component: TaxesForm,
  args: { id: null },
  // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/taxes/new' } },
  },
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TaxesForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Types a name (and a rate when it is empty) and asks to save, as a member does; the summary opens. */
async function typeAndSubmit(root: HTMLElement, submit = 'Create tax'): Promise<void> {
  const canvas = within(root);
  await userEvent.type(await canvas.findByRole('textbox', { name: /^Tax Name/ }), 'Beta');
  const rate = canvas.getByRole('textbox', { name: /^Tax Rate/ });
  if ((rate as HTMLInputElement).value === '') await userEvent.type(rate, '5');
  await userEvent.click(canvas.getByRole('button', { name: submit }));
}

/** The save summary's confirm, once the dialog takes pointer input (Radix disables it while it mounts). */
async function confirmSummary(): Promise<void> {
  const dialog = await within(document.body).findByTestId('confirm-dialog');
  const confirm = within(dialog).getByTestId('confirm-dialog-confirm');
  await waitFor(async () => {
    await expect(getComputedStyle(confirm).pointerEvents).not.toBe('none');
  });
  await userEvent.click(confirm);
}

/**
 * `/setup/taxes/new`: "Add New Tax", Perfex's two fields (Tax Name and Tax Rate (percent), both
 * required), "Create tax" disabled until something is typed.
 */
export const Default: Story = { decorators: [withApi()] };

const EDIT = {
  args: { id: 'a1' },
  parameters: { nextjs: { navigation: { pathname: '/setup/taxes/a1' } } },
} as const;

/** `/setup/taxes/:id`: the record's name as the title, both fields filled, "Save tax". */
export const Edit: Story = { ...EDIT, decorators: [withApi()] };

/** Typing "VAT | 5" leaves "VAT 5": every `|` removed and the spaces collapsed, as Perfex does. */
export const NameCleaned: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const name = await within(canvasElement).findByRole('textbox', { name: /^Tax Name/ });
    await userEvent.type(name, 'VAT | 5');
    await expect(name).toHaveValue('VAT 5');
  },
};

/**
 * Every save is confirmed by what it does (D-25.4): on `/:id`, "Tax Name: Alpha → Beta" and
 * "Tax Rate (percent): 5.00 → 7.50".
 */
export const SaveSummary: Story = {
  ...EDIT,
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = await canvas.findByRole('textbox', { name: /^Tax Name/ });
    await waitFor(async () => {
      await expect(name).toHaveValue('Alpha');
    });
    await userEvent.clear(name);
    await userEvent.type(name, 'Beta');
    const rate = canvas.getByRole('textbox', { name: /^Tax Rate/ });
    await userEvent.clear(rate);
    await userEvent.type(rate, '7.50');
    await userEvent.click(canvas.getByRole('button', { name: 'Save tax' }));
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    // The dialog fades in over 100 ms.
    await waitFor(async () => {
      await expect(dialog).toBeVisible();
    });
    const changes = within(dialog).getByTestId('confirm-dialog-changes');
    await expect(changes).toHaveTextContent('Tax Name: Alpha → Beta');
    await expect(changes).toHaveTextContent('Tax Rate (percent): 5.00 → 7.50');
  },
};

/** A permalink before its record answers: the form's skeleton, and no message (D-39). */
export const Loading: Story = {
  ...EDIT,
  decorators: [withApi(undefined, 'pending')],
};

/** At 375 px: one column, the save bar may wrap; no horizontal overflow. */
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

/**
 * A tax expenses and subscriptions use: Perfex's two warnings, both fields disabled and no submit,
 * as Perfex's modal disables its fields; "Back to list" stays.
 */
export const Locked: Story = {
  ...EDIT,
  decorators: [
    withApi(undefined, {
      status: HTTP_OK,
      body: { ...RECORD, usage: { ...NO_USE, expenses: 3, subscriptions: 1 } },
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notice = await canvas.findByTestId('taxes-locked');
    await expect(notice).toHaveTextContent(en.taxes.tax_is_used_in_expenses_warning);
    await expect(notice).toHaveTextContent(en.taxes.tax_is_used_in_subscriptions_warning);
    await expect(canvas.getByRole('textbox', { name: /^Tax Name/ })).toBeDisabled();
    await expect(canvas.queryByRole('button', { name: 'Save tax' })).toBeNull();
  },
};

/** A default tax in Settings (D-21): the warning to remove it there first, and no submit. */
export const DefaultTax: Story = {
  ...EDIT,
  decorators: [withApi(undefined, { status: HTTP_OK, body: { ...RECORD, isDefault: true } })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notice = await canvas.findByTestId('taxes-locked');
    await expect(notice).toHaveTextContent(en.taxes.default_tax_warning);
    await expect(canvas.queryByRole('button', { name: 'Save tax' })).toBeNull();
  },
};

/** FE-27 `Pending`: confirmed, the save has not answered: "Creating tax…", disabled. */
export const Pending: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement);
    await confirmSummary();
    const buttons = await within(document.body).findAllByRole('button', {
      name: 'Creating tax…',
    });
    for (const button of buttons) await expect(button).toBeDisabled();
  },
};

/** FE-27 `FieldErrors`: a 400 whose issue lands under Name and in the summary, focused (D-29). */
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

/** FE-27 `ServerError`: a 503: the alert inside the form, the edits kept, and Retry (D-29). */
export const ServerError: Story = {
  decorators: [withApi(problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'))],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement);
    await confirmSummary();
    // The dialog fades out before the page is accessible again.
    await waitFor(async () => {
      await expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
    });
    const alert = await within(canvasElement).findByTestId('form-server-error');
    await expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

/** A refused save (D-32): another tax has the name, so the dialog says so in plain words. */
export const SaveRefused: Story = {
  decorators: [withApi(problem(HTTP_CONFLICT, 'ERP-TAXES-0003'))],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement);
    await confirmSummary();
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    const error = await within(dialog).findByTestId('confirm-dialog-error');
    await expect(error.textContent).toBe(en.taxes.errors['ERP-TAXES-0003']);
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/** A refused save (D-32): the record was deleted meanwhile, so the dialog says so in the feature's words. */
export const SaveRefusedDeleted: Story = {
  args: { id: 'a1' },
  decorators: [withApi(problem(HTTP_NOT_FOUND, 'ERP-CORE-0004'))],
  parameters: {
    nextjs: { navigation: { pathname: '/setup/taxes/a1' } },
  },
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement, 'Save tax');
    await confirmSummary();
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    const error = await within(dialog).findByTestId('confirm-dialog-error');
    await expect(error.textContent).toBe(en.taxes.errors['ERP-CORE-0004']);
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/** Opened from the list (D-35): the row renders at once while the record read is still pending. */
export const EditFromList: Story = {
  args: { id: 'a1' },
  decorators: [
    function SeedRowDecorator(Story) {
      setSession({ accessToken: 'story', csrfToken: 'story' });
      http.defaults.adapter = (config) => respond(config, 'pending');
      seedRow('/api/v1/taxes/a1', RECORD);
      return <Story />;
    },
  ],
  parameters: {
    nextjs: { navigation: { pathname: '/setup/taxes/a1' } },
  },
  play: async ({ canvasElement }) => {
    const box = await within(canvasElement).findByRole('textbox', { name: /^Tax Name/ });
    await expect(box).toHaveValue('Alpha');
  },
};

/** The texts a story expects, in the locale it renders (the RTL screenshot opens it under `ar`). */
const TEXTS: Record<Locale, { readonly notFound: string; readonly back: string }> = {
  en: { notFound: en.taxes.errors['ERP-CORE-0004'], back: commonEn.common.back_to_list },
  ar: { notFound: ar.taxes.errors['ERP-CORE-0004'], back: commonAr.common.back_to_list },
};
const RETURN_KEY = 'erp.list.return:/setup/taxes';

/** The not-found page: the plain message, no button, and ONE link: Back to list, to `href`. */
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

/**
 * A permalink to a record that is not there (or that the caller may not read): the api's one 404,
 * `ERP-CORE-0004`, in the feature's plain words (never "Something went wrong"), no Retry (D-32),
 * and "Back to list" to the list the record was opened from (lead 2026-09-27, D-28).
 */
export const NotFound: Story = {
  args: { id: 'gone' },
  decorators: [
    withApi({ status: HTTP_OK, body: RECORD }, problem(HTTP_NOT_FOUND, 'ERP-CORE-0004')),
  ],
  parameters: { nextjs: { navigation: { pathname: '/setup/taxes/gone' } } },
  beforeEach: () => {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ url: '/setup/taxes?q=al' }));
    return () => {
      sessionStorage.removeItem(RETURN_KEY);
    };
  },
  play: async ({ canvasElement, globals }) => {
    await expectNotFound(canvasElement, globals.locale, '/setup/taxes?q=al');
  },
};

/**
 * Opened from the list, but the record is gone (a 404): the same not-found page as a permalink,
 * never the seeded form; "Back to list" to the list base, nothing being recorded here. The row is
 * seeded in the app's own cache, so this story has no private SWR cache.
 */
export const SeededNotFound: Story = {
  args: { id: 's4' },
  decorators: [
    function SeedDecorator(Story) {
      setSession({ accessToken: 'story', csrfToken: 'story' });
      const read = problem(HTTP_NOT_FOUND, 'ERP-CORE-0004');
      http.defaults.adapter = (config) => respond(config, read);
      seedRow('/api/v1/taxes/s4', { ...RECORD, id: 's4' });
      return <Story />;
    },
  ],
  parameters: { nextjs: { navigation: { pathname: '/setup/taxes/s4' } } },
  // Nothing recorded, whatever an earlier story in this tab left: the link is the list base.
  beforeEach: () => {
    sessionStorage.removeItem(RETURN_KEY);
  },
  play: async ({ canvasElement, globals }) => {
    await expectNotFound(canvasElement, globals.locale, '/setup/taxes');
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull();
  },
};

/** Arabic: the form mirrors; the legacy labels carry the English pack text until the reviewer translates them. */
export const Rtl: Story = { decorators: [withApi()], globals: { locale: 'ar' } };
