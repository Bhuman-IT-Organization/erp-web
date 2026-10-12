// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { useEmailTemplate, useEmailTemplates } from '../use-email-templates';

const PAGE = {
  data: [
    {
      id: '4',
      key: 'attendance_notice',
      module: 'timesheets',
      audience: 'staff',
      active: true,
      locales: ['en'],
    },
  ],
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: 1,
    rangeStart: 1,
    modules: ['timesheets'],
    locales: ['en', 'ar'],
  },
};
const DETAIL = {
  ...PAGE.data[0],
  formattingDropped: false,
  locales: ['en', 'ar'],
  mergeFields: [{ token: '{staff_name}', kind: 'text' }],
  versions: { en: { subject: 'Subject 1', message: 'Message 1' } },
  sendTest: { configured: true, recipient: 'user@example.test' },
  etag: '"e1"',
};

function Facets({ params }: { readonly params: Readonly<Record<string, string | number>> | null }) {
  const { data, error } = useEmailTemplates(params);
  return (
    <output data-testid="facets" data-status={error?.status ?? ''}>
      {data === undefined ? '' : `${data.meta.modules.join(',')}|${data.meta.locales.join(',')}`}
    </output>
  );
}

function Detail({ id }: { readonly id: string | null }) {
  const { data } = useEmailTemplate(id);
  return <output data-testid="detail">{data?.etag ?? ''}</output>;
}

const isolated = (ui: React.ReactElement) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{ui}</SWRConfig>,
  );

let fake: FakeAdapter;
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('useEmailTemplates', () => {
  it('reads the list with its query and keeps the meta modules and locales', async () => {
    fake = fakeAdapter(200, PAGE);
    http.defaults.adapter = fake.adapter;
    isolated(<Facets params={{ limit: 1, 'filter[module][in]': 'timesheets' }} />);
    await waitFor(() => {
      expect(screen.getByTestId('facets').textContent).toBe('timesheets|en,ar');
    });
    expect(fake.calls[0]?.method).toBe('GET');
    expect(decodeURIComponent(fake.calls[0]?.url ?? '')).toBe(
      '/api/v1/mail/templates?filter[module][in]=timesheets&limit=1',
    );
  });

  it('a null query asks nothing', async () => {
    fake = fakeAdapter(200, PAGE);
    http.defaults.adapter = fake.adapter;
    isolated(<Facets params={null} />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fake.spy).not.toHaveBeenCalled();
  });

  it('a 403 is an error, never data', async () => {
    fake = fakeAdapter(403, problem(403, 'ERP-AUTH-0005'));
    http.defaults.adapter = fake.adapter;
    isolated(<Facets params={{ limit: 1 }} />);
    await waitFor(() => {
      expect(screen.getByTestId('facets').dataset.status).toBe('403');
    });
    expect(screen.getByTestId('facets').textContent).toBe('');
  });
});

describe('useEmailTemplate', () => {
  it('reads one template by id; a null id asks nothing', async () => {
    fake = fakeAdapter(200, DETAIL);
    http.defaults.adapter = fake.adapter;
    isolated(<Detail id="4" />);
    await waitFor(() => {
      expect(screen.getByTestId('detail').textContent).toBe('"e1"');
    });
    expect(fake.calls.map((c) => c.url)).toEqual(['/api/v1/mail/templates/4']);
    cleanup();
    fake = fakeAdapter(200, DETAIL);
    http.defaults.adapter = fake.adapter;
    isolated(<Detail id={null} />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fake.spy).not.toHaveBeenCalled();
  });
});
