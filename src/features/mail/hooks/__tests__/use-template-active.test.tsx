// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useModuleActive, useTemplateActive } from '../use-template-active';

const ROW = {
  id: '4',
  key: 'attendance_notice',
  module: 'timesheets',
  audience: 'staff',
  active: false,
  locales: ['en'],
};

function Probe() {
  const one = useTemplateActive('4');
  const all = useModuleActive();
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void one.trigger({ active: false }).then((r) => {
            document.body.dataset.one = r.ok ? String(r.data.active) : r.code;
          });
        }}
      >
        one
      </button>
      <button
        type="button"
        onClick={() => {
          void all.trigger({ module: 'timesheets', active: true }).then((r) => {
            document.body.dataset.all = r.ok ? String(r.data.changed) : r.code;
          });
        }}
      >
        all
      </button>
    </div>
  );
}

const show = () =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map() }}>
      <Probe />
    </SWRConfig>,
  );

let fake: FakeAdapter;
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  delete document.body.dataset.one;
  delete document.body.dataset.all;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('useTemplateActive (the list switch, PUT :id/active)', () => {
  it('PUTs { active } and answers the saved list row', async () => {
    fake = fakeAdapter(200, ROW);
    http.defaults.adapter = fake.adapter;
    show();
    await userEvent.click(screen.getByRole('button', { name: 'one' }));
    await waitFor(() => {
      expect(document.body.dataset.one).toBe('false');
    });
    expect(fake.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['PUT', '/api/v1/mail/templates/4/active', { active: false }],
    ]);
  });

  it('a 503 is answered as a failure and never retried (a write, ADR-0031 §5)', async () => {
    fake = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'));
    http.defaults.adapter = fake.adapter;
    show();
    await userEvent.click(screen.getByRole('button', { name: 'one' }));
    await waitFor(() => {
      expect(document.body.dataset.one).toBe('ERP-UPSTREAM-0001');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.spy).toHaveBeenCalledTimes(1);
  });
});

describe('useModuleActive (Enable All and Disable All, POST templates/active)', () => {
  it('POSTs { module, active } and answers how many changed', async () => {
    fake = fakeAdapter(200, { changed: 3 });
    http.defaults.adapter = fake.adapter;
    show();
    await userEvent.click(screen.getByRole('button', { name: 'all' }));
    await waitFor(() => {
      expect(document.body.dataset.all).toBe('3');
    });
    expect(fake.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['POST', '/api/v1/mail/templates/active', { module: 'timesheets', active: true }],
    ]);
  });
});
