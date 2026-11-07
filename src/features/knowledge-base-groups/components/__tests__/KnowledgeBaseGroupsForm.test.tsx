// @vitest-environment happy-dom
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { cleanup, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { PERMISSIONS } from '@/config/permissions';
import { KnowledgeBaseGroupsForm } from '../KnowledgeBaseGroupsForm';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/setup/knowledge-base-groups/new',
}));

const GROUP = {
  id: '1',
  name: 'General',
  groupSlug: 'general',
  description: 'General articles',
  active: true,
  color: '#28B8DA',
  groupOrder: 1,
  totalArticles: 0,
};

const ADMIN_USER = {
  staffId: 1,
  email: 'admin@example.invalid',
  firstName: 'Admin',
  lastName: 'User',
  isAdmin: false,
  roleId: null,
  permissions: [
    PERMISSIONS.knowledgeBase.articles.view,
    PERMISSIONS.knowledgeBase.articles.create,
    PERMISSIONS.knowledgeBase.articles.edit,
    PERMISSIONS.knowledgeBase.articles.delete,
  ],
  locale: 'en',
};

function createAdapter(options?: {
  saveStatus?: number;
  saveData?: unknown;
  user?: typeof ADMIN_USER;
  getGroup?: typeof GROUP;
  getStatus?: number;
  getData?: unknown;
}) {
  const calls: { method: string; url: string; data: unknown }[] = [];
  const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
    const url = new URL(http.getUri(config), 'http://erp.invalid');
    const method = (config.method ?? 'get').toUpperCase();
    const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    calls.push({ method, url: url.pathname, data: body });

    if (url.pathname === '/api/v1/auth/me') {
      return Promise.resolve({
        data: options?.user ?? ADMIN_USER,
        status: 200,
        statusText: '200',
        headers: new AxiosHeaders(),
        config,
      });
    }

    if (method === 'GET' && url.pathname === '/api/v1/knowledge-base-groups/1') {
      if (options?.getStatus && options.getStatus >= 400) {
        return Promise.reject(
          new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, {
            data: options.getData ?? {
              type: 'about:blank',
              status: options.getStatus,
              code: options.getStatus === 404 ? 'ERP-CORE-0004' : 'ERP-UPSTREAM-0001',
              detail: 'error',
            },
            status: options.getStatus,
            statusText: String(options.getStatus),
            headers: new AxiosHeaders(),
            config,
          }),
        );
      }
      return Promise.resolve({
        data: options?.getGroup ?? GROUP,
        status: 200,
        statusText: '200',
        headers: new AxiosHeaders(),
        config,
      });
    }

    if (method === 'POST' || method === 'PATCH') {
      if (options?.saveStatus && options.saveStatus >= 400) {
        const error = new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, {
          data: options.saveData ?? {
            type: 'about:blank',
            status: options.saveStatus,
            code: 'ERP-UPSTREAM-0001',
            detail: 'failed',
          },
          status: options.saveStatus,
          statusText: String(options.saveStatus),
          headers: new AxiosHeaders(),
          config,
        });
        return Promise.reject(error);
      }
      return Promise.resolve({
        data: options?.saveData ?? GROUP,
        status: method === 'POST' ? 201 : 200,
        statusText: 'ok',
        headers: new AxiosHeaders(),
        config,
      });
    }

    return Promise.resolve({
      data: GROUP,
      status: 200,
      statusText: '200',
      headers: new AxiosHeaders(),
      config,
    });
  };
  return { adapter, calls };
}

function show(id: string | null = null, locale: 'en' | 'ar' = 'en') {
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <KnowledgeBaseGroupsForm id={id} />
    </SWRConfig>,
    { locale },
  );
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  navigation.push.mockReset();
});

afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('KnowledgeBaseGroupsForm', () => {
  it('validates required name before opening confirmation', async () => {
    const { adapter, calls } = createAdapter();
    http.defaults.adapter = adapter;
    show();

    const name = await screen.findByRole('textbox', { name: 'Group Name' });
    await userEvent.type(name, 'x'.repeat(256));
    await userEvent.click(screen.getByRole('button', { name: 'Create knowledge base group' }));

    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain('Keep the group name to 191 characters or fewer.');
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('create: confirms a valid create, sends form fields with color, order, disabled, and navigates back', async () => {
    const { adapter, calls } = createAdapter();
    http.defaults.adapter = adapter;
    show();

    // Verify Slug is NOT present on create
    await screen.findByRole('textbox', { name: 'Group Name' });
    expect(screen.queryByRole('textbox', { name: 'Slug' })).toBeNull();

    await userEvent.type(screen.getByRole('textbox', { name: 'Group Name' }), 'General');
    await userEvent.type(screen.getByRole('textbox', { name: 'Short description' }), 'Some desc');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Disabled' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create knowledge base group' }));

    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create knowledge base group' }),
    );

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/setup/knowledge-base-groups', {
        scroll: false,
      });
    });

    expect(
      calls.filter((c) => c.method === 'POST').map(({ method, url, data }) => [method, url, data]),
    ).toEqual([
      [
        'POST',
        '/api/v1/knowledge-base-groups',
        {
          name: 'General',
          color: '#28B8DA',
          description: 'Some desc',
          groupOrder: null,
          disabled: true,
        },
      ],
    ]);
  });

  it('edit: displays slug field, loads existing group, confirms and sends PATCH without unchanged slug', async () => {
    const { adapter, calls } = createAdapter();
    http.defaults.adapter = adapter;
    show('1');

    const name = await screen.findByRole('textbox', { name: 'Group Name' });
    await waitFor(() => {
      expect((name as HTMLInputElement).value).toBe('General');
    });

    // Slug IS present on edit
    const slug = screen.getByRole('textbox', { name: 'Slug' });
    expect((slug as HTMLInputElement).value).toBe('general');

    await userEvent.clear(name);
    await userEvent.type(name, 'General Updated');
    await userEvent.click(screen.getByRole('button', { name: 'Save knowledge base group' }));

    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save knowledge base group' }),
    );

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/setup/knowledge-base-groups', {
        scroll: false,
      });
    });

    // Unchanged slug is NOT sent
    expect(
      calls.filter((c) => c.method === 'PATCH').map(({ method, url, data }) => [method, url, data]),
    ).toEqual([
      [
        'PATCH',
        '/api/v1/knowledge-base-groups/1',
        {
          name: 'General Updated',
          color: '#28B8DA',
          description: 'General articles',
          groupOrder: 1,
          disabled: false,
        },
      ],
    ]);
  });

  it('edit: sends changed slug when modified, and requires slug if empty', async () => {
    const { adapter, calls } = createAdapter();
    http.defaults.adapter = adapter;
    show('1');

    const slug = await screen.findByRole('textbox', { name: 'Slug' });
    await waitFor(() => {
      expect((slug as HTMLInputElement).value).toBe('general');
    });

    // Clearing slug triggers required error
    await userEvent.clear(slug);
    await userEvent.click(screen.getByRole('button', { name: 'Save knowledge base group' }));
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain('Enter a slug.');

    // Changing slug sends it in PATCH payload
    await userEvent.type(slug, 'general-custom');
    await userEvent.click(screen.getByRole('button', { name: 'Save knowledge base group' }));

    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save knowledge base group' }),
    );

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/setup/knowledge-base-groups', {
        scroll: false,
      });
    });

    expect(
      calls.filter((c) => c.method === 'PATCH').map(({ method, url, data }) => [method, url, data]),
    ).toEqual([
      [
        'PATCH',
        '/api/v1/knowledge-base-groups/1',
        {
          name: 'General',
          groupSlug: 'general-custom',
          color: '#28B8DA',
          description: 'General articles',
          groupOrder: 1,
          disabled: false,
        },
      ],
    ]);
  });

  it('loading: shows skeleton while loading group on edit permalink', () => {
    http.defaults.adapter = () => new Promise<never>(() => undefined);
    show('1');

    expect(screen.getByRole('status').getAttribute('data-variant')).toBe('form');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('404 and retry: handles non-retryable 404 and retryable 503 on record fetch', async () => {
    // 404: inline error with message, no retry
    const { adapter: notFoundAdapter } = createAdapter({ getStatus: 404 });
    http.defaults.adapter = notFoundAdapter;
    show('1');

    const inlineError = await screen.findByTestId('inline-error');
    expect(inlineError.textContent).toContain(
      'This knowledge base group no longer exists. It may have been removed.',
    );
    expect(within(inlineError).queryByRole('button', { name: 'Retry' })).toBeNull();

    cleanup();

    // 503: retryable with Retry button
    let getCalls = 0;
    http.defaults.adapter = (config) => {
      const url = new URL(http.getUri(config), 'http://erp.invalid');
      if (url.pathname === '/api/v1/auth/me') {
        return Promise.resolve({
          data: ADMIN_USER,
          status: 200,
          statusText: '200',
          headers: new AxiosHeaders(),
          config,
        });
      }
      getCalls++;
      if (getCalls === 1) {
        return Promise.reject(
          new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, {
            data: { type: 'about:blank', status: 503, code: 'ERP-UPSTREAM-0001', detail: 'down' },
            status: 503,
            statusText: '503',
            headers: new AxiosHeaders(),
            config,
          }),
        );
      }
      return Promise.resolve({
        data: GROUP,
        status: 200,
        statusText: '200',
        headers: new AxiosHeaders(),
        config,
      });
    };

    show('1');
    const error503 = await screen.findByTestId('inline-error');
    const retryBtn = within(error503).getByRole('button', { name: 'Retry' });
    await userEvent.click(retryBtn);

    expect(await screen.findByRole('textbox', { name: 'Group Name' })).toBeTruthy();
  });

  it('server errors on each field: displays each field specific message from message keys', async () => {
    const issues = [
      { path: ['name'], message: 'server name error' },
      { path: ['groupSlug'], message: 'server slug error' },
      { path: ['color'], message: 'server color error' },
      { path: ['description'], message: 'server desc error' },
      { path: ['groupOrder'], message: 'server order error' },
      { path: ['disabled'], message: 'server disabled error' },
    ];
    const { adapter } = createAdapter({
      saveStatus: 400,
      saveData: {
        type: 'about:blank',
        status: 400,
        code: 'ERP-VALIDATION-0001',
        title: 'Validation failed',
        issues,
      },
    });
    http.defaults.adapter = adapter;
    show('1');

    const name = await screen.findByRole('textbox', { name: 'Group Name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'General Edited');
    await userEvent.click(screen.getByRole('button', { name: 'Save knowledge base group' }));

    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save knowledge base group' }),
    );

    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain('This field is required.'); // name
    expect(summary.textContent).toContain('Enter a slug.'); // groupSlug
    expect(summary.textContent).toContain('Enter a color using up to 10 characters.'); // color
    expect(summary.textContent).toContain('Enter a description.'); // description
    expect(summary.textContent).toContain('Enter a whole number for the order.'); // groupOrder
    expect(summary.textContent).toContain('Invalid disabled value.'); // disabled
  });

  it('the Order error: rejects decimal numbers in order field with enter_order message', async () => {
    const { adapter, calls } = createAdapter();
    http.defaults.adapter = adapter;
    show();

    await userEvent.type(screen.getByRole('textbox', { name: 'Group Name' }), 'General');
    const orderInput = screen.getByRole('spinbutton', { name: 'Order' });
    await userEvent.clear(orderInput);
    await userEvent.type(orderInput, '1.5');
    await userEvent.click(screen.getByRole('button', { name: 'Create knowledge base group' }));

    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain('Enter a whole number for the order.');
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('the Order range error: rejects numbers out of range with order_out_of_range message', async () => {
    const { adapter, calls } = createAdapter();
    http.defaults.adapter = adapter;
    show();

    await userEvent.type(screen.getByRole('textbox', { name: 'Group Name' }), 'General');
    const orderInput = screen.getByRole('spinbutton', { name: 'Order' });
    await userEvent.clear(orderInput);
    await userEvent.type(orderInput, '3000000000');
    await userEvent.click(screen.getByRole('button', { name: 'Create knowledge base group' }));

    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(
      'Enter a whole number between -2147483648 and 2147483647.',
    );
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('delete 404: save answered 404 ERP-CORE-0004 stays in dialog with confirm disabled', async () => {
    const { adapter } = createAdapter({
      saveStatus: 404,
      saveData: {
        type: 'about:blank',
        status: 404,
        code: 'ERP-CORE-0004',
        detail: 'Group not found',
      },
    });
    http.defaults.adapter = adapter;
    show('1');

    const name = await screen.findByRole('textbox', { name: 'Group Name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'General Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save knowledge base group' }));

    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save knowledge base group' }),
    );

    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(
      'This knowledge base group no longer exists. It may have been removed.',
    );
    expect(within(dialog).getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('Permissions: /:id read-only without edit locks inputs and hides save button', async () => {
    const readOnlyUser = {
      ...ADMIN_USER,
      permissions: [PERMISSIONS.knowledgeBase.articles.view],
    };
    const { adapter } = createAdapter({ user: readOnlyUser });
    http.defaults.adapter = adapter;

    show('1');

    const name = await screen.findByRole('textbox', { name: 'Group Name' });
    expect(name.hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save knowledge base group' })).toBeNull();
  });

  it('retry: shows retry on server error and re-sends', async () => {
    let callCount = 0;
    http.defaults.adapter = (config) => {
      const url = new URL(http.getUri(config), 'http://erp.invalid');
      if (url.pathname === '/api/v1/auth/me') {
        return Promise.resolve({
          data: ADMIN_USER,
          status: 200,
          statusText: '200',
          headers: new AxiosHeaders(),
          config,
        });
      }
      if (config.method?.toUpperCase() === 'POST') {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(
            new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, {
              data: {
                type: 'about:blank',
                status: 503,
                code: 'ERP-UPSTREAM-0001',
                detail: 'Service unavailable',
              },
              status: 503,
              statusText: '503',
              headers: new AxiosHeaders(),
              config,
            }),
          );
        }
        return Promise.resolve({
          status: 201,
          statusText: '201',
          data: GROUP,
          headers: new AxiosHeaders(),
          config,
        });
      }
      return Promise.resolve({
        status: 200,
        statusText: '200',
        data: GROUP,
        headers: new AxiosHeaders(),
        config,
      });
    };

    show();
    const name = await screen.findByRole('textbox', { name: 'Group Name' });
    await userEvent.type(name, 'General');
    await userEvent.click(screen.getByRole('button', { name: 'Create knowledge base group' }));

    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create knowledge base group' }),
    );

    const serverError = await screen.findByTestId('form-server-error');
    expect(serverError).toBeTruthy();

    const retryBtn = within(serverError).getByRole('button', { name: 'Retry' });
    await userEvent.click(retryBtn);

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/setup/knowledge-base-groups', {
        scroll: false,
      });
    });
  });

  it('Arabic: renders under Arabic locale with ICU plurals', async () => {
    const { adapter } = createAdapter();
    http.defaults.adapter = adapter;
    show(null, 'ar');

    expect(await screen.findByRole('textbox', { name: 'اسم المجموعة' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /مجموعة قاعدة المعرفة/ })).toBeTruthy();
  });

  it('names shown as text: renders HTML characters safely', async () => {
    const { adapter } = createAdapter({
      getGroup: { ...GROUP, name: '<script>alert(1)</script>' },
    });
    http.defaults.adapter = adapter;
    show('1');

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('<script>alert(1)</script>');
    expect(document.querySelector('script')).toBeNull();
  });
});
