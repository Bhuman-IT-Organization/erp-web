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
import { TicketPrioritiesForm } from './TicketPrioritiesForm';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, a private SWR cache per story and the tab's session seeded. A GET
// answers the record; a POST or PATCH answers `save`. Fixture data only (W0-05).
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;
const EN = en['ticket-priorities'];
const RECORD = { id: 'a1', name: 'Urgent' };
const FIELD = new RegExp(`^${EN.ticket_priority_dt_name}`);

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
  title: 'Features/TicketPriorities/TicketPrioritiesForm',
  component: TicketPrioritiesForm,
  args: { id: null },
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/ticket-priorities/new' } },
  },
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TicketPrioritiesForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const CREATE = commonEn.common.create_noun.replace('{noun}', EN.ticket_priority_lowercase);
const SAVE = commonEn.common.save_noun.replace('{noun}', EN.ticket_priority_lowercase);

/** Types a name and asks to save, as a member does; the summary opens. */
async function typeAndSubmit(root: HTMLElement, name = 'Critical', submit = CREATE): Promise<void> {
  const canvas = within(root);
  const box = await canvas.findByRole('textbox', { name: FIELD });
  await userEvent.clear(box);
  await userEvent.type(box, name);
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

const EDIT = {
  args: { id: 'a1' },
  parameters: { nextjs: { navigation: { pathname: '/setup/ticket-priorities/a1' } } },
} as const;

/** `/setup/ticket-priorities/new`: "Add New Ticket Priority", one required field, nothing typed yet. */
export const Default: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('heading', { level: 1, name: EN.ticket_priority_add }),
    ).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: FIELD })).toHaveValue('');
  },
};

/** `/setup/ticket-priorities/:id`: the record's name as the title, the field filled. */
export const Edit: Story = {
  ...EDIT,
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByRole('textbox', { name: FIELD })).toHaveValue('Urgent');
    });
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Urgent');
  },
};

/** Every save is confirmed by what it does: "Priority Name: Urgent → Critical". */
export const SaveSummary: Story = {
  ...EDIT,
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const name = await within(canvasElement).findByRole('textbox', { name: FIELD });
    await waitFor(async () => {
      await expect(name).toHaveValue('Urgent');
    });
    await typeAndSubmit(canvasElement, 'Critical', SAVE);
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    await waitFor(async () => {
      await expect(dialog).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-changes')).toHaveTextContent(
      `${EN.ticket_priority_dt_name}: Urgent → Critical`,
    );
  },
};

/** A permalink before its record answers: the form's skeleton, and no message. */
export const Loading: Story = { ...EDIT, decorators: [withApi(undefined, 'pending')] };

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

/** `Pending`: confirmed, the save has not answered: "Creating ticket priority…", disabled. */
export const Pending: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement);
    await confirmSummary();
    const buttons = await within(document.body).findAllByRole('button', {
      name: commonEn.common.creating_noun.replace('{noun}', EN.ticket_priority_lowercase),
    });
    for (const button of buttons) await expect(button).toBeDisabled();
  },
};

/** An Arabic name is a valid name: Perfex accepts any character up to 50. */
export const ArabicName: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement, 'عاجل');
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    await expect(within(dialog).getByRole('heading')).toHaveTextContent('عاجل');
  },
};

/** 51 characters: refused on the client with the "50 characters or fewer" message, no dialog. */
export const NameTooLong: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement, 'x'.repeat(51));
    const expected = EN.name_too_long.replace('{max}', '50');
    await expect((await within(canvasElement).findAllByText(expected)).length).toBeGreaterThan(0);
    await expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
  },
};

/** `FieldErrors`: a 400 whose issue lands under the field and in the focused summary. */
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
    await waitFor(async () => {
      await expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
    });
    const alert = await within(canvasElement).findByTestId('form-server-error');
    await expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

/** A refused save: the record was deleted meanwhile, so the dialog says so in the feature's words. */
export const SaveRefusedDeleted: Story = {
  ...EDIT,
  decorators: [withApi(problem(HTTP_NOT_FOUND, 'ERP-CORE-0004'))],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement, 'Critical', SAVE);
    await confirmSummary();
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    const error = await within(dialog).findByTestId('confirm-dialog-error');
    await expect(error.textContent).toBe(EN.errors['ERP-CORE-0004']);
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/** Opened from the list: the row renders at once while the record read is still pending. */
export const EditFromList: Story = {
  ...EDIT,
  decorators: [
    function SeedRowDecorator(Story) {
      setSession({ accessToken: 'story', csrfToken: 'story' });
      http.defaults.adapter = (config) => respond(config, 'pending');
      seedRow('/api/v1/ticket-priorities/a1', RECORD);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const box = await within(canvasElement).findByRole('textbox', { name: FIELD });
    await expect(box).toHaveValue('Urgent');
  },
};

const TEXTS: Record<Locale, { readonly notFound: string; readonly back: string }> = {
  en: { notFound: EN.errors['ERP-CORE-0004'], back: commonEn.common.back_to_list },
  ar: {
    notFound: ar['ticket-priorities'].errors['ERP-CORE-0004'],
    back: commonAr.common.back_to_list,
  },
};
const RETURN_KEY = 'erp.list.return:/setup/ticket-priorities';

/**
 * A permalink to a record that is not there: the api's 404 `ERP-CORE-0004` in the feature's plain
 * words, no Retry, and one link, "Back to list", to the list the record was opened from.
 */
export const NotFound: Story = {
  args: { id: 'gone' },
  decorators: [
    withApi({ status: HTTP_OK, body: RECORD }, problem(HTTP_NOT_FOUND, 'ERP-CORE-0004')),
  ],
  parameters: { nextjs: { navigation: { pathname: '/setup/ticket-priorities/gone' } } },
  beforeEach: () => {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ url: '/setup/ticket-priorities?q=ur' }));
    return () => {
      sessionStorage.removeItem(RETURN_KEY);
    };
  },
  play: async ({ canvasElement, globals }) => {
    const texts = TEXTS[toSupportedLocale(globals.locale)];
    const error = await within(canvasElement).findByTestId('inline-error');
    await expect(error).toHaveTextContent(texts.notFound);
    await expect(within(canvasElement).queryByRole('button')).toBeNull();
    const links = within(canvasElement).getAllByRole('link');
    await expect(links).toHaveLength(1);
    await expect(links[0]).toHaveAccessibleName(texts.back);
    await expect(links[0]).toHaveAttribute('href', '/setup/ticket-priorities?q=ur');
  },
};

/** Arabic: the form mirrors and shows the Arabic title and label. */
export const Rtl: Story = {
  decorators: [withApi()],
  globals: { locale: 'ar' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('heading', {
        level: 1,
        name: ar['ticket-priorities'].ticket_priority_add,
      }),
    ).toBeVisible();
  },
};
