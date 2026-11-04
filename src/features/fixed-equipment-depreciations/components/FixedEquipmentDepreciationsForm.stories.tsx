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
import { FixedEquipmentDepreciationsForm } from './FixedEquipmentDepreciationsForm';
import { PERMISSIONS } from '@/config/permissions';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, a private SWR cache per story and the tab's session seeded. A GET
// answers the record; a POST or PATCH answers `save`. Fixture data only (W0-05).
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;
const EN = en['fixed-equipment-depreciations'];
const AR = ar['fixed-equipment-depreciations'];
const RECORD = { id: 'a1', name: 'Straight line', term: 60 };
/** The signed-in member of every story but `ReadOnly`: an administrator holds every code. */
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
const NAME = new RegExp(`^${EN.fe_depreciation_name}`);
const MONTHS = new RegExp(`^${EN.fe_number_of_months}`);

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
    const adapter: ApiAdapter = (config) => {
      const path = (config.url ?? '').split('?')[0] ?? '';
      // The member is an administrator, so the form is editable (`ReadOnly` answers its own `/me`).
      if (path === '/api/v1/auth/me') return respond(config, { status: HTTP_OK, body: ADMIN });
      return respond(config, (config.method ?? 'get').toUpperCase() === 'GET' ? read : save);
    };
    http.defaults.adapter = adapter;
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const meta = {
  title: 'Features/FixedEquipmentDepreciations/FixedEquipmentDepreciationsForm',
  component: FixedEquipmentDepreciationsForm,
  args: { id: null },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/setup/fixed-equipment-depreciations/new' },
    },
  },
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FixedEquipmentDepreciationsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const NOUN = EN.depreciation_lowercase;
const CREATE = commonEn.common.create_noun.replace('{noun}', NOUN);
const SAVE = commonEn.common.save_noun.replace('{noun}', NOUN);

/** Fills both fields and asks to save, as a member does; the summary opens. */
async function typeAndSubmit(
  root: HTMLElement,
  name = 'Five years',
  months = '60',
  submit = CREATE,
): Promise<void> {
  const canvas = within(root);
  const box = await canvas.findByRole('textbox', { name: NAME });
  await userEvent.clear(box);
  await userEvent.type(box, name);
  const term = canvas.getByRole('spinbutton', { name: MONTHS });
  await userEvent.clear(term);
  await userEvent.type(term, months);
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
  parameters: {
    nextjs: { navigation: { pathname: '/setup/fixed-equipment-depreciations/a1' } },
  },
} as const;

const VIEW_ONLY_ME = {
  staffId: 9,
  email: 'viewer@example.invalid',
  firstName: 'View',
  lastName: 'Only',
  isAdmin: false,
  roleId: null,
  permissions: [PERMISSIONS.fixedEquipment.settingDepreciation.view],
  locale: null,
};

/** A member holding view, not edit: the record shows locked, with no Save. */
export const ReadOnly: Story = {
  ...EDIT,
  decorators: [
    function ViewOnlyDecorator(Story) {
      setSession({ accessToken: 'story', csrfToken: 'story' });
      http.defaults.adapter = (config) =>
        respond(
          config,
          (config.url ?? '').startsWith('/api/v1/auth/me')
            ? { status: HTTP_OK, body: VIEW_ONLY_ME }
            : { status: HTTP_OK, body: RECORD },
        );
      return (
        <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
          <Story />
        </SWRConfig>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const name = await within(canvasElement).findByRole('textbox', { name: NAME });
    await waitFor(async () => {
      await expect(name).toHaveValue('Straight line');
    });
    await expect(name).toBeDisabled();
  },
};

/** `/setup/fixed-equipment-depreciations/new`: "Add Depreciations", Perfex's two required fields, empty. */
export const Default: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('heading', { level: 1, name: EN.fe_add_depreciations }),
    ).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: NAME })).toHaveValue('');
    await expect(canvas.getByRole('spinbutton', { name: MONTHS })).toHaveValue(null);
  },
};

/** `/setup/fixed-equipment-depreciations/:id`: the record's name as the title, both fields filled. */
export const Edit: Story = {
  ...EDIT,
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByRole('textbox', { name: NAME })).toHaveValue('Straight line');
    });
    await expect(canvas.getByRole('spinbutton', { name: MONTHS })).toHaveValue(60);
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Straight line');
  },
};

/** An old Perfex row stored without a term: the Number of Months field opens empty, and must be filled to save. */
export const NoTerm: Story = {
  ...EDIT,
  decorators: [withApi(undefined, { status: HTTP_OK, body: { ...RECORD, term: null } })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByRole('textbox', { name: NAME })).toHaveValue('Straight line');
    });
    await expect(canvas.getByRole('spinbutton', { name: MONTHS })).toHaveValue(null);
  },
};

/** Every save is confirmed by what it does: the name, from and to. */
export const SaveSummary: Story = {
  ...EDIT,
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const name = await within(canvasElement).findByRole('textbox', { name: NAME });
    await waitFor(async () => {
      await expect(name).toHaveValue('Straight line');
    });
    await typeAndSubmit(canvasElement, 'Five years', '60', SAVE);
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    await waitFor(async () => {
      await expect(dialog).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-changes')).toHaveTextContent(
      commonEn.common.change_from_to
        .replace('{label}', EN.fe_depreciation_name)
        .replace('{from}', 'Straight line')
        .replace('{to}', 'Five years'),
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

/** `Pending`: confirmed, the save has not answered: the creating label, disabled. */
export const Pending: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement);
    await confirmSummary();
    const buttons = await within(document.body).findAllByRole('button', {
      name: commonEn.common.creating_noun.replace('{noun}', NOUN),
    });
    for (const button of buttons) await expect(button).toBeDisabled();
  },
};

/** An Arabic name is a valid name: Perfex accepts any character up to 200. */
export const ArabicName: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement, 'إهلاك ثابت');
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    await expect(within(dialog).getByRole('heading')).toHaveTextContent('إهلاك ثابت');
  },
};

/** 201 characters: refused on the client, under the field and in the summary, no dialog. */
export const NameTooLong: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement, 'x'.repeat(201));
    await expect(await within(canvasElement).findByTestId('error-summary')).toBeVisible();
    await expect(within(canvasElement).getByRole('textbox', { name: NAME })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
  },
};

/** 1.5 months: refused on the client, a whole number greater than 0, no dialog. */
export const MonthsNotWhole: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement, 'Five years', '1.5');
    await expect(await within(canvasElement).findByTestId('error-summary')).toBeVisible();
    await expect(within(canvasElement).getByRole('spinbutton', { name: MONTHS })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
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
    await typeAndSubmit(canvasElement, 'Five years', '60', SAVE);
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
      seedRow('/api/v1/fixed-equipment-depreciations/a1', RECORD);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const box = await within(canvasElement).findByRole('textbox', { name: NAME });
    await expect(box).toHaveValue('Straight line');
  },
};

const TEXTS: Record<Locale, { readonly notFound: string; readonly back: string }> = {
  en: { notFound: EN.errors['ERP-CORE-0004'], back: commonEn.common.back_to_list },
  ar: { notFound: AR.errors['ERP-CORE-0004'], back: commonAr.common.back_to_list },
};
const RETURN_KEY = 'erp.list.return:/setup/fixed-equipment-depreciations';

/**
 * A permalink to a record that is not there: the api's 404 `ERP-CORE-0004` in the feature's plain
 * words, no Retry, and one link, "Back to list", to the list the record was opened from.
 */
export const NotFound: Story = {
  args: { id: 'gone' },
  decorators: [
    withApi({ status: HTTP_OK, body: RECORD }, problem(HTTP_NOT_FOUND, 'ERP-CORE-0004')),
  ],
  parameters: {
    nextjs: { navigation: { pathname: '/setup/fixed-equipment-depreciations/gone' } },
  },
  beforeEach: () => {
    sessionStorage.setItem(
      RETURN_KEY,
      JSON.stringify({ url: '/setup/fixed-equipment-depreciations?q=line' }),
    );
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
    await expect(links[0]).toHaveAttribute('href', '/setup/fixed-equipment-depreciations?q=line');
  },
};

/** Opened from the list, the record answers 404: the whole page is the not-found state, never the seeded form. */
export const SeededNotFound: Story = {
  args: { id: 's4' },
  decorators: [
    function SeedDecorator(Story) {
      setSession({ accessToken: 'story', csrfToken: 'story' });
      const read = problem(HTTP_NOT_FOUND, 'ERP-CORE-0004');
      http.defaults.adapter = (config) => respond(config, read);
      seedRow('/api/v1/fixed-equipment-depreciations/s4', { ...RECORD, id: 's4' });
      return <Story />;
    },
  ],
  parameters: {
    nextjs: { navigation: { pathname: '/setup/fixed-equipment-depreciations/s4' } },
  },
  beforeEach: () => {
    sessionStorage.removeItem(RETURN_KEY);
  },
  play: async ({ canvasElement, globals }) => {
    const texts = TEXTS[toSupportedLocale(globals.locale)];
    const error = await within(canvasElement).findByTestId('inline-error');
    await expect(error).toHaveTextContent(texts.notFound);
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull();
    const links = within(canvasElement).getAllByRole('link');
    await expect(links).toHaveLength(1);
    await expect(links[0]).toHaveAttribute('href', '/setup/fixed-equipment-depreciations');
  },
};

/** Arabic: the form mirrors and shows the Arabic title and labels. */
export const Rtl: Story = {
  decorators: [withApi()],
  globals: { locale: 'ar' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('heading', {
        level: 1,
        name: AR.fe_add_depreciations,
      }),
    ).toBeVisible();
  },
};
