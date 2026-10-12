// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModuleName } from '@/config/modules';
import { PERMISSIONS } from '@/config/permissions';
import { http } from '@/lib/api/http';
import { clearSession, markSignedOut, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { usePermissions } from '../use-permissions';

/**
 * The hook idiom of `src/lib/api/__tests__/use-common-api.test.tsx`: a fake adapter on the shared
 * axios instance and a private SWR cache per render. What is asserted is the admin bypass reading
 * identically to the api's (`isAdmin || codes.includes(code)`, ADR-0033 d.4), the any-of helper for
 * the view/viewOwn pair, and that nothing is permitted while the read is in flight.
 */
const VIEW = PERMISSIONS.staff.members.view;
const EDIT = PERMISSIONS.staff.members.edit;
const VIEW_OWN = PERMISSIONS.crm.customers.viewOwn;

const me = (isAdmin: boolean, permissions: readonly string[]) => ({
  staffId: 1,
  email: 'someone@example.com',
  firstName: 'A',
  lastName: 'B',
  isAdmin,
  roleId: null,
  permissions,
  locale: null,
});

function Probe() {
  const { isAdmin, codes, isLoading, can, canAny, me: payload, error, retry } = usePermissions();
  return (
    <>
      <button type="button" data-testid="retry" onClick={retry} />
      <output
        data-testid="probe"
        data-admin={String(isAdmin)}
        data-loading={String(isLoading)}
        data-count={String(codes.length)}
        data-can-view={String(can(VIEW))}
        data-can-edit={String(can(EDIT))}
        data-any-pair={String(canAny([VIEW, VIEW_OWN]))}
        data-any-single={String(canAny(VIEW))}
        data-any-undefined={String(canAny(undefined))}
        data-me={payload === undefined ? 'none' : payload.email}
        data-error={error === undefined ? 'none' : error.code}
      />
    </>
  );
}

/**
 * No module of this copy is switchable (`MODULE_NAMES` is empty), so the probe asks about a sample
 * name: the switch reads whatever names `/me` sends.
 */
const SAMPLE_MODULE = 'sample' as ModuleName;

/** The module switch's two members (ADR-0042), apart from the code probe. */
function ModuleProbe() {
  const { disabledModules, isModuleDisabled } = usePermissions();
  return (
    <output
      data-testid="module-probe"
      data-disabled={disabledModules.join(',')}
      data-sample-off={String(isModuleDisabled(SAMPLE_MODULE))}
    />
  );
}

const isolatedModules = (options: { shouldRetryOnError?: boolean } = {}) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), ...options }}>
      <ModuleProbe />
    </SWRConfig>,
  );

const isolated = () =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map() }}>
      <Probe />
    </SWRConfig>,
  );

let fake: FakeAdapter | undefined;
const answer = (body: unknown): void => {
  fake = fakeAdapter(200, body);
  http.defaults.adapter = fake.adapter;
};

describe('usePermissions', () => {
  // `/me` is asked only once the tab's session is signed in (WR-08): seed one before each render.
  beforeEach(() => {
    fake = undefined;
    setSession({ accessToken: 't', csrfToken: 'c' });
  });
  // Unmount BEFORE the session resets (03.2 RESEARCH Pitfall 9).
  afterEach(() => {
    cleanup();
    clearSession();
    delete http.defaults.adapter;
  });

  it('reads GET /api/v1/auth/me once and exposes the codes it returned', async () => {
    answer(me(false, [VIEW]));
    isolated();
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.count).toBe('1');
    });
    expect(fake?.calls[0]?.url).toBe('/api/v1/auth/me');
    expect(fake?.calls[0]?.method).toBe('GET');
  });

  it('exposes the /me payload as `me`: undefined while loading, then the payload, from ONE request (D-36)', async () => {
    answer(me(false, [VIEW]));
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Probe />
        <Probe />
      </SWRConfig>,
    );
    expect(screen.getAllByTestId('probe')[0]?.dataset.me).toBe('none');
    await waitFor(() => {
      expect(screen.getAllByTestId('probe')[1]?.dataset.me).toBe('someone@example.com');
    });
    expect(fake?.calls.length).toBe(1);
  });

  it('permits nothing while the read is in flight', () => {
    answer(me(true, []));
    isolated();
    const probe = screen.getByTestId('probe');
    expect(probe.dataset.loading).toBe('true');
    expect(probe.dataset.admin).toBe('false');
    expect(probe.dataset.canView).toBe('false');
  });

  it('lets an administrator through for a code the permission set does not hold (ADR-0033 d.4)', async () => {
    answer(me(true, []));
    isolated();
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.admin).toBe('true');
    });
    const probe = screen.getByTestId('probe');
    expect(probe.dataset.canView).toBe('true');
    expect(probe.dataset.canEdit).toBe('true');
    expect(probe.dataset.count).toBe('0');
  });

  it('gives a member exactly the codes it holds and nothing more', async () => {
    answer(me(false, [VIEW]));
    isolated();
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.canView).toBe('true');
    });
    expect(screen.getByTestId('probe').dataset.canEdit).toBe('false');
  });

  it('canAny is true when any code of the pair is held, and true for undefined', async () => {
    answer(me(false, [VIEW_OWN]));
    isolated();
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.anyPair).toBe('true');
    });
    const probe = screen.getByTestId('probe');
    expect(probe.dataset.anySingle).toBe('false');
    expect(probe.dataset.anyUndefined).toBe('true');
  });

  it('canAny is false when the member holds neither code of the pair', async () => {
    answer(me(false, [EDIT]));
    isolated();
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.canEdit).toBe('true');
    });
    expect(screen.getByTestId('probe').dataset.anyPair).toBe('false');
  });

  it('asks nothing and reports loading while the session is still pending (WR-08)', async () => {
    clearSession();
    answer(me(true, []));
    isolated();
    const probe = screen.getByTestId('probe');
    expect(probe.dataset.loading).toBe('true');
    expect(probe.dataset.canView).toBe('false');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake?.calls).toEqual([]);
  });

  it('is not loading and permits nothing once the session is signed out', async () => {
    markSignedOut();
    answer(me(true, []));
    isolated();
    const probe = screen.getByTestId('probe');
    expect(probe.dataset.loading).toBe('false');
    expect(probe.dataset.canView).toBe('false');
    expect(probe.dataset.canEdit).toBe('false');
    expect(probe.dataset.anyPair).toBe('false');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake?.calls).toEqual([]);
  });

  it('reports a /me 5xx as an error, not as loading and not as a refusal, and permits nothing (D-39)', async () => {
    fake = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'));
    http.defaults.adapter = fake.adapter;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Probe />
      </SWRConfig>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.error).toBe('ERP-UPSTREAM-0001');
    });
    const probe = screen.getByTestId('probe');
    expect(probe.dataset.loading).toBe('false');
    expect(probe.dataset.anyPair).toBe('false');
    expect(probe.dataset.canView).toBe('false');
  });

  it('reads disabledModules from /me: a module switched off (ADR-0042)', async () => {
    answer({ ...me(false, [VIEW]), disabledModules: [SAMPLE_MODULE] });
    isolatedModules();
    await waitFor(() => {
      expect(screen.getByTestId('module-probe').dataset.sampleOff).toBe('true');
    });
    expect(screen.getByTestId('module-probe').dataset.disabled).toBe(SAMPLE_MODULE);
  });

  it('reads a /me without disabledModules as every module on', async () => {
    answer(me(false, [VIEW]));
    isolatedModules();
    await waitFor(() => {
      expect(fake?.calls).toHaveLength(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId('module-probe').dataset.sampleOff).toBe('false');
    expect(screen.getByTestId('module-probe').dataset.disabled).toBe('');
  });

  it('reports no module switched off while /me loads or after it failed', async () => {
    answer({ ...me(false, [VIEW]), disabledModules: [SAMPLE_MODULE] });
    isolatedModules();
    expect(screen.getByTestId('module-probe').dataset.sampleOff).toBe('false');
    cleanup();
    fake = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'));
    http.defaults.adapter = fake.adapter;
    isolatedModules({ shouldRetryOnError: false });
    await waitFor(() => {
      expect(fake?.calls).toHaveLength(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId('module-probe').dataset.sampleOff).toBe('false');
  });

  it('retry() asks /me again, once', async () => {
    fake = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'));
    http.defaults.adapter = fake.adapter;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Probe />
      </SWRConfig>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.error).toBe('ERP-UPSTREAM-0001');
    });
    expect(fake.calls.length).toBe(1);
    await userEvent.click(screen.getByTestId('retry'));
    await waitFor(() => {
      expect(fake?.calls.length).toBe(2);
    });
    expect(fake.calls[1]?.url).toBe('/api/v1/auth/me');
  });
});
