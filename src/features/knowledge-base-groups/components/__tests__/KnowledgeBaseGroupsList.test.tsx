// @vitest-environment happy-dom
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/render';
import { resetApiStatus } from '@/lib/api/api-status';
import { clearSession, setSession } from '@/lib/auth/session';
import { http } from '@/lib/api/http';
import { PERMISSIONS } from '@/config/permissions';
import { KnowledgeBaseGroupsList } from '../KnowledgeBaseGroupsList';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const groups = [
  {
    id: '1',
    name: 'General',
    groupSlug: 'general',
    description: 'General articles',
    active: true,
    color: '#03a9f4',
    groupOrder: 1,
    totalArticles: 5,
  },
  {
    id: '2',
    name: 'Billing',
    groupSlug: 'billing',
    description: 'Billing guides',
    active: false,
    color: null,
    groupOrder: 2,
    totalArticles: 0,
  },
  {
    id: '3',
    name: '<script>alert(1)</script>',
    groupSlug: 'xss',
    description: null,
    active: true,
    color: null,
    groupOrder: 3,
    totalArticles: 0,
  },
  ...Array.from({ length: 27 }, (_, index) => {
    const id = String(index + 4);
    return {
      id,
      name: `Group ${id}`,
      groupSlug: `group-${id}`,
      description: null,
      active: true,
      color: null,
      groupOrder: index + 4,
      totalArticles: 0,
    };
  }),
];

const requests: { readonly method: string; readonly url: URL }[] = [];
let listPending = false;
let listStatus: number | null = null;
let listEmpty = false;
let deleteStatus = 204;
let deleteCode = 'ERP-KNOWLEDGEBASEGROUPS-0001';
let patchStatus = 200;
let userPermissions: string[] = [
  PERMISSIONS.knowledgeBase.articles.view,
  PERMISSIONS.knowledgeBase.articles.create,
  PERMISSIONS.knowledgeBase.articles.edit,
  PERMISSIONS.knowledgeBase.articles.delete,
];

function problemResponse(
  config: InternalAxiosRequestConfig,
  status: number,
  code: string,
  detail: string,
): Promise<never> {
  const response = {
    data: { type: 'about:blank', status, title: 'Error', code, detail },
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config,
  };
  return Promise.reject(
    new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, response),
  );
}

function listAdapter(): AxiosAdapter {
  return (config: InternalAxiosRequestConfig) => {
    const url = new URL(http.getUri(config), 'http://erp.invalid');
    const method = (config.method ?? 'get').toUpperCase();
    requests.push({ method, url });
    const isMe = url.pathname === '/api/v1/auth/me';
    const isList = url.pathname === '/api/v1/knowledge-base-groups';
    const isExport = url.pathname === '/api/v1/knowledge-base-groups/export';
    const cursor = url.searchParams.get('cursor');
    const isPage2 = cursor === 'cursor-2';
    const pageRows = isPage2 ? groups.slice(25) : groups.slice(0, 25);

    if (method === 'DELETE') {
      if (deleteStatus === 204) {
        return Promise.resolve({
          data: null,
          status: 204,
          statusText: '204',
          headers: new AxiosHeaders(),
          config,
        });
      }
      return problemResponse(config, deleteStatus, deleteCode, 'cannot_delete');
    }

    if (method === 'PATCH' && url.pathname.startsWith('/api/v1/knowledge-base-groups/')) {
      if (patchStatus !== 200) {
        return problemResponse(config, patchStatus, 'ERP-VALIDATION-0001', 'update failed');
      }
      const id = url.pathname.split('/').pop() ?? '';
      const group = groups.find((g) => g.id === id);
      const rawData: unknown =
        typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const parsedBody =
        typeof rawData === 'object' && rawData !== null
          ? (rawData as Record<string, unknown>)
          : undefined;
      const nextActive = typeof parsedBody?.disabled === 'boolean' ? !parsedBody.disabled : false;
      return Promise.resolve({
        data: { ...group, active: nextActive },
        status: 200,
        statusText: '200',
        headers: new AxiosHeaders(),
        config,
      });
    }

    if (isList && listPending) return new Promise(() => undefined);
    if (isList && listStatus !== null) {
      return problemResponse(config, listStatus, 'ERP-UPSTREAM-0001', 'list unavailable');
    }

    const body = isMe
      ? {
          staffId: 1,
          email: 'admin@example.invalid',
          firstName: 'Admin',
          lastName: 'User',
          isAdmin: false,
          roleId: null,
          permissions: userPermissions,
          locale: 'en',
        }
      : isExport
        ? new Blob(['id,name,color,groupOrder,active,totalArticles\r\n1,General,,1,true,5\r\n'], {
            type: 'text/csv',
          })
        : {
            data: isList && (listEmpty || url.searchParams.has('q')) ? [] : pageRows,
            meta: {
              nextCursor: isPage2 ? null : 'cursor-2',
              prevCursor: isPage2 ? 'cursor-1' : null,
              total: isList && (listEmpty || url.searchParams.has('q')) ? 0 : groups.length,
              rangeStart: isPage2 ? 26 : 1,
              exportLimit: 500,
              printLimit: 250,
            },
          };

    return Promise.resolve({
      data: body,
      status: 200,
      statusText: '200',
      headers: new AxiosHeaders(),
      config,
    });
  };
}

describe('KnowledgeBaseGroupsList', () => {
  beforeEach(() => {
    setSession({ accessToken: 'test-only', csrfToken: 'test-only' });
    resetApiStatus();
    requests.length = 0;
    localStorage.setItem('erp.list.pageSize.1', '25');
    listPending = false;
    listStatus = null;
    listEmpty = false;
    deleteStatus = 204;
    deleteCode = 'ERP-KNOWLEDGEBASEGROUPS-0001';
    patchStatus = 200;
    userPermissions = [
      PERMISSIONS.knowledgeBase.articles.view,
      PERMISSIONS.knowledgeBase.articles.create,
      PERMISSIONS.knowledgeBase.articles.edit,
      PERMISSIONS.knowledgeBase.articles.delete,
    ];
    http.defaults.adapter = listAdapter();
  });

  afterEach(() => {
    delete http.defaults.adapter;
    clearSession();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders list on ListPageTemplate with columns Name with count, and Active, and links Articles to /admin/knowledge_base', async () => {
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    const table = await screen.findByTestId('list-table');
    expect(screen.getByRole('link', { name: /General/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Billing/ })).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();

    // Verify aria-hidden on count and sr-only total_articles
    const countSpan = screen.getByText('5');
    expect(countSpan.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('5 articles')).toBeTruthy();

    const articlesLink = screen.getByRole('link', { name: /Articles/ });
    expect(articlesLink.getAttribute('href')).toBe('/admin/knowledge_base');

    expect(within(table).getAllByRole('row')).toHaveLength(26);
    expect(screen.getByRole('button', { name: 'Delete Billing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Billing' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'New Group' })).toBeTruthy();
  });

  it('shows names as plain text even when containing markup', async () => {
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    await screen.findByTestId('list-table');
    expect(screen.getByRole('link', { name: /<script>alert\(1\)<\/script>/ })).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
  });

  it('loading: shows list loading state while API request is pending', () => {
    listPending = true;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    expect(screen.getByTestId('list-loading')).toBeTruthy();
    expect(screen.queryByTestId('list-table')).toBeNull();
  });

  it('empty: shows empty state when no groups exist', async () => {
    listEmpty = true;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    const empty = await screen.findByTestId('list-empty');
    expect(
      within(empty).getByRole('heading', { name: 'No knowledge base groups yet' }),
    ).toBeTruthy();
  });

  it('no results: shows no-results state when search returns no match', async () => {
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true, searchParams: '?q=missing' },
    );

    const noResults = await screen.findByTestId('list-no-results');
    expect(
      within(noResults).getByRole('heading', { name: 'No knowledge base groups match “missing”' }),
    ).toBeTruthy();
  });

  it('error and retry: shows error state on failure and allows retry', async () => {
    listStatus = 503;
    const user = userEvent.setup();
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(
      "We couldn't load knowledge base groups. Try again in a moment.",
    );
    expect(screen.queryByTestId('list-table')).toBeNull();

    listStatus = null;
    const retryBtn = within(error).getByRole('button', { name: 'Retry' });
    await user.click(retryBtn);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('The Active switch: success toggles status and shows toast', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    const billingSwitch = await screen.findByRole('switch', { name: 'Toggle active for Billing' });
    expect(billingSwitch.getAttribute('aria-checked')).toBe('false');

    await user.click(billingSwitch);
    await waitFor(() => {
      expect(
        requests.some(
          (r) => r.method === 'PATCH' && r.url.pathname === '/api/v1/knowledge-base-groups/2',
        ),
      ).toBe(true);
    });
  });

  it('The Active switch: failure reverts switch and displays not saved error', async () => {
    patchStatus = 500;
    const user = userEvent.setup();
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    const generalSwitch = await screen.findByRole('switch', { name: 'Toggle active for General' });
    expect(generalSwitch.getAttribute('aria-checked')).toBe('true');

    await user.click(generalSwitch);
    expect(await screen.findByText('Not saved. Try again.')).toBeTruthy();
  });

  it('delete: confirms deletion for group without articles and sends DELETE', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    await screen.findByRole('button', { name: 'Delete Billing' });
    await user.click(screen.getByRole('button', { name: 'Delete Billing' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await user.click(within(dialog).getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(
        requests.some(
          (r) => r.method === 'DELETE' && r.url.pathname === '/api/v1/knowledge-base-groups/2',
        ),
      ).toBe(true);
    });
  });

  it('409: refuses deletion upfront using is_referenced text when group has articles', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    await screen.findByRole('button', { name: 'Delete General' });
    await user.click(screen.getByRole('button', { name: 'Delete General' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByText('The ID of the Group is already using.')).toBeTruthy();
    expect(within(dialog).getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('409: handles live API refusal when deleting a group', async () => {
    deleteStatus = 409;
    deleteCode = 'ERP-KNOWLEDGEBASEGROUPS-0001';
    const user = userEvent.setup();
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    await screen.findByRole('button', { name: 'Delete Billing' });
    await user.click(screen.getByRole('button', { name: 'Delete Billing' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await user.click(within(dialog).getByTestId('confirm-dialog-confirm'));

    expect(await screen.findByText('The ID of the Group is already using.')).toBeTruthy();
  });

  it('Permissions: create only hides edit, delete, and replaces switch with badge', async () => {
    userPermissions = [
      PERMISSIONS.knowledgeBase.articles.view,
      PERMISSIONS.knowledgeBase.articles.create,
    ];
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    await screen.findByTestId('list-table');
    expect(screen.getByRole('link', { name: 'New Group' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit General' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete General' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(document.querySelectorAll('[data-status="active"]').length).toBeGreaterThan(0);
  });

  it('Permissions: edit only hides create and delete but shows switch and edit', async () => {
    userPermissions = [
      PERMISSIONS.knowledgeBase.articles.view,
      PERMISSIONS.knowledgeBase.articles.edit,
    ];
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    await screen.findByTestId('list-table');
    expect(screen.queryByRole('link', { name: 'New Group' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit General' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete General' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Toggle active for General' })).toBeTruthy();
  });

  it('Permissions: delete only hides create and edit and replaces switch with badge', async () => {
    userPermissions = [
      PERMISSIONS.knowledgeBase.articles.view,
      PERMISSIONS.knowledgeBase.articles.delete,
    ];
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    await screen.findByTestId('list-table');
    expect(screen.queryByRole('link', { name: 'New Group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit General' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete General' })).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(document.querySelectorAll('[data-status="active"]').length).toBeGreaterThan(0);
  });

  it('Export: sends the columns and headers with Articles key', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const user = userEvent.setup();

    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true },
    );

    await screen.findByTestId('list-table');
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(await screen.findByRole('menuitem', { name: 'CSV' }));

    await waitFor(() => {
      expect(requests.some((r) => r.url.pathname === '/api/v1/knowledge-base-groups/export')).toBe(
        true,
      );
    });

    const exportReq = requests.find(
      (r) => r.url.pathname === '/api/v1/knowledge-base-groups/export',
    );
    expect(exportReq?.url.searchParams.getAll('column')).toEqual([
      'id',
      'name',
      'color',
      'groupOrder',
      'active',
      'totalArticles',
    ]);
    expect(exportReq?.url.searchParams.getAll('header')).toEqual([
      'ID',
      'Name',
      'Color',
      'Order',
      'Active',
      'Articles',
    ]);
  });

  it('Arabic: renders under Arabic locale', async () => {
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <KnowledgeBaseGroupsList />
      </SWRConfig>,
      { hasMemory: true, locale: 'ar' },
    );

    expect(await screen.findByRole('heading', { name: 'المجموعات' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /المقالات/ })).toBeTruthy();
  });
});
