// @vitest-environment happy-dom
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http } from '@/lib/api/http';
import { clearSession, markSignedOut, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { useActor } from '../use-actor';

const FORBIDDEN = 403;

const me = (isAdmin: boolean) => ({
  staffId: 9,
  email: 'someone@example.invalid',
  firstName: 'A',
  lastName: 'B',
  isAdmin,
  roleId: null,
  permissions: ['staff.members.view'],
  locale: null,
});

function Probe() {
  const { isAdmin, staffId, isLoading } = useActor();
  return (
    <output
      data-testid="probe"
      data-admin={String(isAdmin)}
      data-staff={String(staffId)}
      data-loading={String(isLoading)}
    />
  );
}

const isolated = () =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map() }}>
      <Probe />
    </SWRConfig>,
  );

let fake: FakeAdapter;
const answer = (status: number, body: unknown): void => {
  fake = fakeAdapter(status, body);
  http.defaults.adapter = fake.adapter;
};

describe('useActor (the administrator flag, ADR-0034 d.2)', () => {
  beforeEach(() => {
    setSession({ accessToken: 't', csrfToken: 'c' });
  });
  afterEach(() => {
    delete http.defaults.adapter;
    clearSession();
  });

  it('reads the flag from GET /api/v1/auth/me — the session, never a permission code', async () => {
    answer(200, me(true));
    isolated();
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.admin).toBe('true');
    });
    expect(fake.calls[0]?.url).toBe('/api/v1/auth/me');
    expect(screen.getByTestId('probe').dataset.staff).toBe('9');
  });

  it('a member without the flag is not an administrator however many codes they hold', async () => {
    answer(200, me(false));
    isolated();
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.loading).toBe('false');
    });
    expect(screen.getByTestId('probe').dataset.admin).toBe('false');
  });

  it('fails closed while the read is in flight and when it is refused', async () => {
    answer(FORBIDDEN, problem(FORBIDDEN, 'ERP-AUTH-0005'));
    isolated();
    expect(screen.getByTestId('probe').dataset.admin).toBe('false');
    expect(screen.getByTestId('probe').dataset.loading).toBe('true');
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.loading).toBe('false');
    });
    expect(screen.getByTestId('probe').dataset.admin).toBe('false');
  });

  it('asks nothing while the tab has no session yet (WR-08)', async () => {
    clearSession();
    answer(200, me(true));
    isolated();
    expect(screen.getByTestId('probe').dataset.loading).toBe('true');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.calls).toEqual([]);
  });

  it('is not loading and not an administrator once the session is signed out', async () => {
    markSignedOut();
    answer(200, me(true));
    isolated();
    expect(screen.getByTestId('probe').dataset.loading).toBe('false');
    expect(screen.getByTestId('probe').dataset.admin).toBe('false');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.calls).toEqual([]);
  });
});
