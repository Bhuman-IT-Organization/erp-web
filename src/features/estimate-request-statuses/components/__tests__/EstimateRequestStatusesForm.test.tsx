// @vitest-environment happy-dom
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { SWRConfig, type Cache } from 'swr';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import { http } from '@/lib/api/http';
import { resetApiStatus } from '@/lib/api/api-status';
import { seedRow } from '@/lib/api/row-seed';
import { clearSession, setSession } from '@/lib/auth/session';
import { EstimateRequestStatusesForm } from '@/features/estimate-request-statuses/components/EstimateRequestStatusesForm';
import { estimateRequestStatusesPath } from '@/features/estimate-request-statuses/api/estimate-request-statuses.endpoints';
import { GuardedEstimateRequestStatusesForm } from '@/features/estimate-request-statuses/components/EstimateRequestStatusesForm';
import en from '@/features/estimate-request-statuses/messages/en.json';
import ar from '@/features/estimate-request-statuses/messages/ar.json';
import { BreadcrumbLabelContext } from '@/lib/hooks/use-breadcrumb-label';

const push = vi.fn<(href: string, options?: { readonly scroll: boolean }) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/estimate-request-statuses/new',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({
    href,
    onClick,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { readonly href: string }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    />
  ),
}));

const processing = {
  id: '2',
  name: 'Processing',
  color: '#007bff',
  statusorder: 2,
  flag: 'processing',
  total_request: 1,
};
const EN = en['estimate-request-statuses'];
const AR = ar['estimate-request-statuses'];
const ISOLATED = {
  provider: () => new Map() as Cache,
  shouldRetryOnError: false,
  dedupingInterval: 0,
};
const GLOBAL = { shouldRetryOnError: false, dedupingInterval: 0 };

const problem = (status: number, code: string, issues?: unknown) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
  ...(issues === undefined ? {} : { issues }),
});

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';

let recordReply: Reply | null;
let saveReply: Reply | null;
let meReply: Reply;
const requests: { method: string; path: string; body: unknown }[] = [];

function adapter(): AxiosAdapter {
  return (config: InternalAxiosRequestConfig) => {
    const url = new URL(http.getUri(config), 'http://erp.invalid');
    const method = (config.method ?? 'get').toUpperCase();
    const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    requests.push({ method, path: url.pathname, body });

    const saving = method === 'POST' || method === 'PATCH';
    const reply = saving
      ? (saveReply ?? {
          status: method === 'POST' ? 201 : 200,
          body: {
            ...processing,
            ...(typeof body === 'object' && body !== null ? body : {}),
            id: method === 'POST' ? '4' : processing.id,
            flag: null,
            total_request: 0,
          },
        })
      : url.pathname === '/api/v1/auth/me'
        ? meReply
        : /^\/api\/v1\/estimate-request-statuses\/[^/]+$/.test(url.pathname)
          ? (recordReply ?? { status: 200, body: processing })
          : {
              status: 200,
              body: {
                data: [processing],
                meta: {
                  nextCursor: null,
                  prevCursor: null,
                  total: 3,
                  rangeStart: 1,
                  exportLimit: 500,
                  printLimit: 250,
                },
              },
            };
    if (reply === 'pending') return new Promise<never>(() => undefined);
    const response: AxiosResponse<unknown> = {
      data: reply.body,
      status: reply.status,
      statusText: String(reply.status),
      headers: new AxiosHeaders(),
      config,
    };

    return reply.status < 300
      ? Promise.resolve(response)
      : Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
  };
}

function show(id: string | null, swr: typeof GLOBAL = ISOLATED, locale?: 'ar') {
  return renderWithProviders(
    <SWRConfig value={swr}>
      <EstimateRequestStatusesForm id={id} />
    </SWRConfig>,
    { hasMemory: true, ...(locale === undefined ? {} : { locale }) },
  );
}

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

beforeEach(() => {
  setSession({ accessToken: 'test-only', csrfToken: 'test-only' });
  resetApiStatus();
  requests.length = 0;
  recordReply = null;
  saveReply = null;
  meReply = { status: 200, body: me(true) };
  push.mockClear();
  http.defaults.adapter = adapter();
});

afterEach(() => {
  delete http.defaults.adapter;
  clearSession();
  localStorage.clear();
});

describe('Estimate Request Status form', () => {
  it('shows client validation for a name over 50 characters without sending a save', async () => {
    const user = userEvent.setup();
    show(null);
    await user.type(await screen.findByRole('textbox', { name: 'Status Name' }), 'A'.repeat(51));
    await user.click(screen.getByRole('button', { name: 'Create status' }));

    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(
      'Status Name: Keep the status name to 50 characters or fewer.',
    );
    expect(requests.some((request) => request.method === 'POST')).toBe(false);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('creates a status on the standard form page with the next order', async () => {
    const user = userEvent.setup();
    show(null);

    expect(await screen.findByRole('heading', { name: 'New Status' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Status Order').value).toBe('4');
    await user.type(screen.getByRole('textbox', { name: 'Status Name' }), 'Ready');
    await user.click(screen.getByRole('button', { name: 'Create status' }));
    const confirmation = await screen.findByTestId('confirm-dialog');
    await user.click(within(confirmation).getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.method === 'POST' && request.path === '/api/v1/estimate-request-statuses',
        ),
      ).toBe(true);
    });
    expect(requests.find((request) => request.method === 'POST')?.body).toMatchObject({
      name: 'Ready',
      statusorder: 4,
    });
    expect(push).toHaveBeenCalledWith('/setup/estimate-request-statuses', { scroll: false });
  });

  it('maps a 400 field issue to the translated form error, not the server text', async () => {
    saveReply = {
      status: 400,
      body: problem(400, 'ERP-VALIDATION-0001', [
        { path: ['name'], message: 'raw server validation text' },
      ]),
    };
    const user = userEvent.setup();
    show(null);
    await user.type(await screen.findByRole('textbox', { name: 'Status Name' }), 'Ready');
    await user.click(screen.getByRole('button', { name: 'Create status' }));
    const confirmation = await screen.findByTestId('confirm-dialog');
    await user.click(within(confirmation).getByTestId('confirm-dialog-confirm'));

    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain('Status Name: Enter a status name.');
    expect(document.body.textContent).not.toContain('raw server validation text');
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps edits after a retryable save error and retries without another summary confirmation', async () => {
    saveReply = {
      status: 503,
      body: problem(503, 'ERP-UPSTREAM-0001'),
    };
    const user = userEvent.setup();
    show(null);
    await user.type(await screen.findByRole('textbox', { name: 'Status Name' }), 'Ready');
    await user.click(screen.getByRole('button', { name: 'Create status' }));
    const confirmation = await screen.findByTestId('confirm-dialog');
    await user.click(within(confirmation).getByTestId('confirm-dialog-confirm'));

    const error = await screen.findByTestId('form-server-error');
    expect(error.textContent).toContain("couldn't save your changes");
    expect(await screen.findByRole('textbox', { name: 'Status Name' })).toHaveProperty(
      'value',
      'Ready',
    );
    saveReply = null;
    await user.click(within(error).getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(requests.filter((request) => request.method === 'POST')).toHaveLength(2);
    });
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(push).toHaveBeenCalledWith('/setup/estimate-request-statuses', { scroll: false });
  });

  it('loads the existing values on the edit page and saves changes', async () => {
    const user = userEvent.setup();
    show('2');

    expect(await screen.findByRole('heading', { name: 'Processing' })).toBeTruthy();
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Status Name' });
    expect(name.value).toBe('Processing');
    expect(screen.getByLabelText<HTMLInputElement>('Status Order').value).toBe('2');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.clear(name);
    await user.type(name, 'In progress');
    await user.click(screen.getByRole('button', { name: 'Save status' }));
    const confirmation = await screen.findByTestId('confirm-dialog');
    await user.click(within(confirmation).getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.method === 'PATCH' && request.path === '/api/v1/estimate-request-statuses/2',
        ),
      ).toBe(true);
    });
    expect(requests.find((request) => request.method === 'PATCH')?.body).toMatchObject({
      name: 'In progress',
      statusorder: 2,
    });
  });

  it('shows the not-found state for a 404 record instead of rendering a form', async () => {
    recordReply = {
      status: 404,
      body: problem(404, 'ERP-CORE-0004'),
    };
    show('2');

    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain('This status no longer exists.');
    expect(screen.queryByRole('textbox', { name: 'Status Name' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to list' }).getAttribute('href')).toBe(
      '/setup/estimate-request-statuses',
    );
  });

  it('publishes a null breadcrumb when a seeded list row answers 404', async () => {
    const published = vi.fn<(label: string | null | undefined) => void>();
    recordReply = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    seedRow(estimateRequestStatusesPath('2'), processing);
    renderWithProviders(
      <SWRConfig value={GLOBAL}>
        <BreadcrumbLabelContext.Provider value={published}>
          <EstimateRequestStatusesForm id="2" />
        </BreadcrumbLabelContext.Provider>
      </SWRConfig>,
      { hasMemory: true },
    );
    await screen.findByTestId('inline-error');
    await waitFor(() => {
      expect(published).toHaveBeenLastCalledWith(null);
    });
  });

  it('publishes a null breadcrumb when a permalink answers 404', async () => {
    const published = vi.fn<(label: string | null | undefined) => void>();
    recordReply = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    renderWithProviders(
      <SWRConfig value={ISOLATED}>
        <BreadcrumbLabelContext.Provider value={published}>
          <EstimateRequestStatusesForm id="missing" />
        </BreadcrumbLabelContext.Provider>
      </SWRConfig>,
      { hasMemory: true },
    );
    await screen.findByTestId('inline-error');
    await waitFor(() => {
      expect(published).toHaveBeenLastCalledWith(null);
    });
  });

  it('shows the seeded record and retry action when its read answers 503', async () => {
    recordReply = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    show('2');
    const error = await screen.findByTestId('inline-error');
    expect(within(error).getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Status Name' })).toBeNull();
  });

  it('renders markup in a record name as text', async () => {
    const name = '<img src=x onerror=alert(1)>';
    recordReply = { status: 200, body: { ...processing, name } };
    show('2');
    expect(await screen.findByRole('heading', { name })).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('asks before discarding dirty edits and navigates only after confirmation', async () => {
    const user = userEvent.setup();
    show('2');
    const name = await screen.findByRole('textbox', { name: 'Status Name' });
    await user.type(name, ' updated');
    await user.click(screen.getByRole('button', { name: 'Back to list' }));

    const discard = await screen.findByTestId('confirm-dialog');
    expect(within(discard).getByRole('heading').textContent).toBe('Discard changes?');
    expect(push).not.toHaveBeenCalled();
    await user.click(within(discard).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/estimate-request-statuses');
    });
  });

  it('round-trips edited color and blank order through the summary and API payload', async () => {
    const user = userEvent.setup();
    show('2');
    const color = await screen.findByRole('textbox', { name: 'Color' });
    const order = screen.getByRole('spinbutton', { name: 'Status Order' });
    await user.clear(color);
    await user.type(color, '#123456');
    await user.clear(order);
    await user.click(screen.getByRole('button', { name: 'Save status' }));

    const confirmation = await screen.findByTestId('confirm-dialog');
    expect(within(confirmation).getByTestId('confirm-dialog-changes').textContent).toContain(
      '#123456',
    );
    expect(within(confirmation).getByTestId('confirm-dialog-changes').textContent).toContain('2');
    await user.click(within(confirmation).getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(requests.some((request) => request.method === 'PATCH')).toBe(true);
    });
    expect(requests.find((request) => request.method === 'PATCH')?.body).toMatchObject({
      color: '#123456',
      statusorder: null,
    });
  });

  it('treats a zero-padded numeric order as unchanged in the save summary', async () => {
    const user = userEvent.setup();
    recordReply = { status: 200, body: { ...processing, statusorder: 7 } };
    show('2');
    const order = await screen.findByRole<HTMLInputElement>('spinbutton', {
      name: 'Status Order',
    });
    await user.clear(order);
    await user.type(order, '007');
    await user.click(screen.getByRole('button', { name: 'Save status' }));
    const summary = await screen.findByTestId('confirm-dialog');
    expect(within(summary).queryByTestId('confirm-dialog-changes')).toBeNull();
  });

  describe('Guarded Estimate Request Status form and Arabic', () => {
    it('allows an administrator to see the form', async () => {
      showGuardedForm();
      expect(await screen.findByRole('heading', { name: EN.new_status })).toBeTruthy();
    });

    it('refuses a non-administrator before requesting estimate request status data', async () => {
      meReply = { status: 200, body: me(false) };
      showGuardedForm();
      expect(await screen.findByTestId('permission-refused')).toBeTruthy();
      expect(
        requests.filter(({ path }) => path.startsWith('/api/v1/estimate-request-statuses')),
      ).toHaveLength(0);
    });

    it('renders Arabic labels and direction', async () => {
      const { container } = show(null, ISOLATED, 'ar');
      expect(await screen.findByRole('textbox', { name: AR.status_name })).toBeTruthy();
      expect(document.documentElement.dir).toBe('rtl');
      expect(physicalClassesIn(container)).toEqual([]);
    });
  });

  function showGuardedForm(): void {
    renderWithProviders(
      <SWRConfig value={ISOLATED}>
        <GuardedEstimateRequestStatusesForm id={null} />
      </SWRConfig>,
      { hasMemory: true },
    );
  }
});
