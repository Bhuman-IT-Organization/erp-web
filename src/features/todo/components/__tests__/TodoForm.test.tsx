// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import commonEn from '@/messages/common/en.json';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';
import { GuardedTodosForm, TodosForm } from '../TodoForm';

/**
 * The To Do create and edit page (Perfex's modal, a page here): one required field, Description.
 * These cover what the SCREEN decides: the blank refusal on the client, the trimmed body, where each
 * outcome of a save shows (a field problem under the field, a network or server failure as the
 * form's alert with Retry), the edit read (404 plain words, 503 Retry), and the auth-only guard.
 * The transport is a fake axios adapter on the shared instance.
 */
const EN = en.todo;
const AR = ar.todo;
const COMMON = commonEn.common;
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST_PAGE = '/setup/todo';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/todo/new',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const RECORD = {
  id: '7',
  description: 'Call Ali',
  finished: false,
  dateAdded: '2026-10-02T20:30:15.000Z',
  dateFinished: null,
};
const me = (isAdmin: boolean) => ({
  staffId: 1,
  email: 'someone@example.invalid',
  firstName: 'Some',
  lastName: 'One',
  isAdmin,
  roleId: null,
  permissions: [],
  locale: null,
});

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';
const problem = (status: number, code: string, issues?: unknown): Reply => ({
  status,
  body: { type: 'about:blank', status, title: code, code, ...(issues ? { issues } : {}) },
});

let api: { me: Reply; read: Reply; save: Reply };
let requests: { readonly method: string; readonly url: URL; readonly body: unknown }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  const raw: unknown = config.data;
  requests.push({ method, url, body: typeof raw === 'string' ? JSON.parse(raw) : raw });
  const reply =
    url.pathname === '/api/v1/auth/me' ? api.me : method === 'GET' ? api.read : api.save;
  if (reply === 'pending') return new Promise<never>(() => undefined);
  const response = {
    data: reply.body,
    status: reply.status,
    statusText: String(reply.status),
    headers: new AxiosHeaders(),
    config,
  };
  if (reply.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

const saves = () => requests.filter((r) => r.method === 'POST' || r.method === 'PATCH');
const reads = () =>
  requests.filter((r) => r.method === 'GET' && r.url.pathname !== '/api/v1/auth/me');

function show(ui: ReactElement, { locale }: { locale?: 'ar' } = {}) {
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      {ui}
      <Toaster />
    </SWRConfig>,
    { hasMemory: true, ...(locale === undefined ? {} : { locale }) },
  );
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = {
    me: { status: HTTP_OK, body: me(false) },
    read: { status: HTTP_OK, body: RECORD },
    save: { status: HTTP_CREATED, body: RECORD },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
});
afterEach(() => {
  toast.dismiss();
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  localStorage.clear();
});

const field = () => screen.findByRole('textbox', { name: new RegExp(`^${EN.description}`) });
const noun = EN.noun_todo;
const createLabel = COMMON.create_noun.replace('{noun}', noun);
const saveLabel = COMMON.save_noun.replace('{noun}', noun);
const creatingLabel = COMMON.creating_noun.replace('{noun}', noun);
const submit = (label: string) => screen.getByRole('button', { name: label });
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

describe('TodosForm: create', () => {
  it('/new is titled "New To Do" with Description empty and required, in one Details section', async () => {
    show(<TodosForm id={null} />);
    const box = await field();
    expect((box as HTMLInputElement).value).toBe('');
    expect(box.hasAttribute('required') || box.getAttribute('aria-required') === 'true').toBe(true);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.new_todo);
    expect(screen.getByText(EN.section_details)).toBeTruthy();
    expect(submit(createLabel)).toBeTruthy();
    expect(reads()).toHaveLength(0);
  });

  it('refuses a blank description on the client: the field error, and no request', async () => {
    show(<TodosForm id={null} />);
    const description = await field();
    await userEvent.type(description, ' ');
    await userEvent.click(submit(createLabel));
    expect((await screen.findAllByText(EN.enter_description)).length).toBeGreaterThan(0);
    await settle();
    expect(saves()).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it('sends one POST with the description trimmed, toasts "To do saved" and returns to the list', async () => {
    show(<TodosForm id={null} />);
    await userEvent.type(await field(), '  Call Ali  ');
    await userEvent.click(submit(createLabel));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(LIST_PAGE);
    });
    expect(saves()).toHaveLength(1);
    expect(saves()[0]).toMatchObject({ method: 'POST', body: { description: 'Call Ali' } });
    expect(saves()[0]?.url.pathname).toBe('/api/v1/todo');
    expect(await screen.findByText(EN.saved_toast)).toBeTruthy();
  });

  it('sends markup as typed: "<b>x</b>" is text', async () => {
    show(<TodosForm id={null} />);
    await userEvent.type(await field(), '<b>x</b>');
    await userEvent.click(submit(createLabel));
    await waitFor(() => {
      expect(saves()).toHaveLength(1);
    });
    expect(saves()[0]?.body).toEqual({ description: '<b>x</b>' });
    expect(document.querySelector('b')).toBeNull();
  });

  it('Pending: once sent, the submit reads "Creating to do…" and is disabled', async () => {
    api.save = 'pending';
    show(<TodosForm id={null} />);
    await userEvent.type(await field(), 'Call Ali');
    await userEvent.click(submit(createLabel));
    const pending = await screen.findByRole('button', { name: creatingLabel });
    expect(pending.hasAttribute('disabled')).toBe(true);
  });

  it('FieldErrors: a 400 with a description issue shows the KEY under the field, never the api text', async () => {
    api.save = problem(HTTP_BAD_REQUEST, 'ERP-VALIDATION-0001', [
      { path: ['description'], message: 'server text, never rendered' },
    ]);
    show(<TodosForm id={null} />);
    await userEvent.type(await field(), 'Call Ali');
    await userEvent.click(submit(createLabel));
    expect((await screen.findAllByText(EN.enter_description)).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('server text, never rendered');
    expect(push).not.toHaveBeenCalled();
  });

  it('ServerError: a 503 shows the alert in the form, keeps the edit, and Retry re-sends it', async () => {
    api.save = problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001');
    show(<TodosForm id={null} />);
    const box = await field();
    await userEvent.type(box, 'Call Ali');
    await userEvent.click(submit(createLabel));
    const alert = await screen.findByTestId('form-server-error');
    expect((box as HTMLInputElement).value).toBe('Call Ali');
    api.save = { status: HTTP_CREATED, body: RECORD };

    await userEvent.click(within(alert).getByRole('button', { name: COMMON.retry }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(LIST_PAGE);
    });
    expect(saves()).toHaveLength(2);
    expect(saves()[1]?.body).toEqual({ description: 'Call Ali' });
  });
});

describe('TodoForm: edit', () => {
  it('shows the record: titled "Edit To Do", the field filled, the save label, and one read of /todo/7', async () => {
    show(<TodosForm id="7" />);
    const box = await field();
    await waitFor(() => {
      expect((box as HTMLInputElement).value).toBe('Call Ali');
    });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.edit_todo);
    expect(submit(saveLabel)).toBeTruthy();
    expect(reads()[0]?.url.pathname).toBe('/api/v1/todo/7');
  });

  it('sends one PATCH with the new description and returns to the list', async () => {
    api.save = { status: HTTP_OK, body: { ...RECORD, description: 'Call Omar' } };
    show(<TodosForm id="7" />);
    const box = await field();
    await waitFor(() => {
      expect((box as HTMLInputElement).value).toBe('Call Ali');
    });
    await userEvent.clear(box);
    await userEvent.type(box, 'Call Omar');
    await userEvent.click(submit(saveLabel));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(LIST_PAGE);
    });
    expect(saves()).toHaveLength(1);
    expect(saves()[0]).toMatchObject({ method: 'PATCH', body: { description: 'Call Omar' } });
    expect(saves()[0]?.url.pathname).toBe('/api/v1/todo/7');
  });

  it("a save answered 404 (deleted meanwhile, or not yours) says so in the feature's words and keeps the edit", async () => {
    api.save = problem(HTTP_NOT_FOUND, 'ERP-CORE-0004');
    show(<TodosForm id="7" />);
    const box = await field();
    await waitFor(() => {
      expect((box as HTMLInputElement).value).toBe('Call Ali');
    });
    await userEvent.clear(box);
    await userEvent.type(box, 'Call Omar');
    await userEvent.click(submit(saveLabel));
    const alert = await screen.findByTestId('form-server-error');
    expect(alert.textContent).toContain(EN.errors['ERP-CORE-0004']);
    expect((box as HTMLInputElement).value).toBe('Call Omar');
    expect(push).not.toHaveBeenCalled();
  });

  it('a permalink answered 404 says so in plain words: no Retry, and Back to list to /todo', async () => {
    api.read = problem(HTTP_NOT_FOUND, 'ERP-CORE-0004');
    show(<TodosForm id="9" />);
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-CORE-0004']);
    expect(error.textContent).not.toContain(COMMON.something_went_wrong);
    expect(screen.queryByRole('button', { name: COMMON.retry })).toBeNull();
    expect(screen.getByRole('link', { name: COMMON.back_to_list }).getAttribute('href')).toBe(
      LIST_PAGE,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a permalink whose read fails with a 503 offers Retry', async () => {
    api.read = problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001');
    show(<TodosForm id="7" />);
    const error = await screen.findByTestId('inline-error');
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
  });

  it('Loading: no error and no form while the record is unknown', async () => {
    api.read = 'pending';
    show(<TodosForm id="7" />);
    await settle();
    expect(screen.queryByTestId('inline-error')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a description holding markup is shown as text in the field, and no element is created', async () => {
    api.read = { status: HTTP_OK, body: { ...RECORD, description: '<b>x</b>' } };
    show(<TodosForm id="7" />);
    const box = await field();
    await waitFor(() => {
      expect((box as HTMLInputElement).value).toBe('<b>x</b>');
    });
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('GuardedTodoForm: any signed-in member (no admin gate)', () => {
  it('a member who is not an administrator can add a to do', async () => {
    show(<GuardedTodosForm id={null} />);
    expect(await field()).toBeTruthy();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });

  it('shows no form and no refusal while session is pending', () => {
    clearSession();
    show(<GuardedTodosForm id={null} />);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });
});

describe('TodosForm: Arabic (FE-20)', () => {
  it('Rtl: renders under ar with the pack label and no physical-direction class', async () => {
    const { container } = show(<TodosForm id={null} />, { locale: 'ar' });
    await screen.findByRole('textbox', { name: new RegExp(`^${AR.description}`) });
    expect(document.documentElement.dir).toBe('rtl');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
