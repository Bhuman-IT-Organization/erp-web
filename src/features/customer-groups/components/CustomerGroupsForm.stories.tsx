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
import { CustomerGroupsForm } from './CustomerGroupsForm';

// Texts the stories look for. If a story fails with "unable to find an element", compare these
// with src/features/customer-groups/messages/en.json and fix them here, in one place.
const NAME_FIELD = /^Name/;
const NAME_FIELD_TITLE = 'Name';
const CREATE_BUTTON = 'Create customer group';
const SAVE_BUTTON = 'Save customer group';
const CREATING_BUTTON = 'Creating customer group…';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, a private SWR cache per story and the tab's session seeded. A GET
// answers the record; a POST or PATCH answers `save`. Fixture data only.
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;
const RECORD = {
  id: 'a1',
  name: 'Alpha',
  dateCreated: '2026-10-02T20:30:15.000Z',
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
  title: 'Features/CustomerGroups/CustomerGroupsForm',
  component: CustomerGroupsForm,
  args: { id: null },
  // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/customer-groups/new' } },
  },
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CustomerGroupsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Types a name and asks to save, as a member does; the summary opens. */
async function typeAndSubmit(root: HTMLElement, submit = CREATE_BUTTON): Promise<void> {
  const canvas = within(root);
  await userEvent.type(await canvas.findByRole('textbox', { name: NAME_FIELD }), 'Beta');
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
 * `/setup/customer-groups/new`: "Add Customer Group", one field (Name, required),
 * "Create customer group" disabled until something is typed.
 */
export const Default: Story = { decorators: [withApi()] };

const EDIT = {
  args: { id: 'a1' },
  parameters: { nextjs: { navigation: { pathname: '/setup/customer-groups/a1' } } },
} as const;

/** `/setup/customer-groups/:id`: the record's name as the title, the field filled, "Save customer group". */
export const Edit: Story = { ...EDIT, decorators: [withApi()] };

/** Every save is confirmed by what it does: on `/:id`, "Name: Alpha → Beta". */
export const SaveSummary: Story = {
  ...EDIT,
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = await canvas.findByRole('textbox', { name: NAME_FIELD });
    await waitFor(async () => {
      await expect(name).toHaveValue('Alpha');
    });
    await userEvent.clear(name);
    await userEvent.type(name, 'Beta');
    await userEvent.click(canvas.getByRole('button', { name: SAVE_BUTTON }));
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    // The dialog fades in over 100 ms.
    await waitFor(async () => {
      await expect(dialog).toBeVisible();
    });
    const changes = within(dialog).getByTestId('confirm-dialog-changes');
    await expect(changes).toHaveTextContent(`${NAME_FIELD_TITLE}: Alpha → Beta`);
  },
};

/** A permalink before its record answers: the form's skeleton, and no message. */
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

/** `Pending`: confirmed, the save has not answered: "Creating customer group…", disabled. */
export const Pending: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement);
    await confirmSummary();
    const buttons = await within(document.body).findAllByRole('button', {
      name: CREATING_BUTTON,
    });
    for (const button of buttons) await expect(button).toBeDisabled();
  },
};

/** `FieldErrors`: a 400 whose issue lands under Name and in the summary, focused. */
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

/** `ServerError`: a 503: the alert inside the form, the edits kept, and Retry. */
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

/** A refused save: the record was deleted meanwhile, so the dialog says so in the feature's words. */
export const SaveRefusedDeleted: Story = {
  args: { id: 'a1' },
  decorators: [withApi(problem(HTTP_NOT_FOUND, 'ERP-CORE-0004'))],
  parameters: {
    nextjs: { navigation: { pathname: '/setup/customer-groups/a1' } },
  },
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement, SAVE_BUTTON);
    await confirmSummary();
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    const error = await within(dialog).findByTestId('confirm-dialog-error');
    await expect(error.textContent).toBe(en['customer-groups'].errors['ERP-CORE-0004']);
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/** Opened from the list: the row renders at once while the record read is still pending. */
export const EditFromList: Story = {
  args: { id: 'a1' },
  decorators: [
    function SeedRowDecorator(Story) {
      setSession({ accessToken: 'story', csrfToken: 'story' });
      http.defaults.adapter = (config) => respond(config, 'pending');
      seedRow('/api/v1/customer-groups/a1', RECORD);
      return <Story />;
    },
  ],
  parameters: {
    nextjs: { navigation: { pathname: '/setup/customer-groups/a1' } },
  },
  play: async ({ canvasElement }) => {
    const box = await within(canvasElement).findByRole('textbox', { name: NAME_FIELD });
    await expect(box).toHaveValue('Alpha');
  },
};

/** The texts a story expects, in the locale it renders (the RTL screenshot opens it under `ar`). */
const TEXTS: Record<Locale, { readonly notFound: string; readonly back: string }> = {
  en: {
    notFound: en['customer-groups'].errors['ERP-CORE-0004'],
    back: commonEn.common.back_to_list,
  },
  ar: {
    notFound: ar['customer-groups'].errors['ERP-CORE-0004'],
    back: commonAr.common.back_to_list,
  },
};
const RETURN_KEY = 'erp.list.return:/setup/customer-groups';

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
 * `ERP-CORE-0004`, in the feature's plain words (never "Something went wrong"), no Retry,
 * and "Back to list" to the list the record was opened from.
 */
export const NotFound: Story = {
  args: { id: 'gone' },
  decorators: [
    withApi({ status: HTTP_OK, body: RECORD }, problem(HTTP_NOT_FOUND, 'ERP-CORE-0004')),
  ],
  parameters: { nextjs: { navigation: { pathname: '/setup/customer-groups/gone' } } },
  beforeEach: () => {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ url: '/setup/customer-groups?q=al' }));
    return () => {
      sessionStorage.removeItem(RETURN_KEY);
    };
  },
  play: async ({ canvasElement, globals }) => {
    await expectNotFound(canvasElement, globals.locale, '/setup/customer-groups?q=al');
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
      seedRow('/api/v1/customer-groups/s4', { ...RECORD, id: 's4' });
      return <Story />;
    },
  ],
  parameters: { nextjs: { navigation: { pathname: '/setup/customer-groups/s4' } } },
  // Nothing recorded, whatever an earlier story in this tab left: the link is the list base.
  beforeEach: () => {
    sessionStorage.removeItem(RETURN_KEY);
  },
  play: async ({ canvasElement, globals }) => {
    await expectNotFound(canvasElement, globals.locale, '/setup/customer-groups');
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull();
  },
};

/** Arabic: the form mirrors; the labels carry the English pack text until the reviewer translates them. */
export const Rtl: Story = { decorators: [withApi()], globals: { locale: 'ar' } };
