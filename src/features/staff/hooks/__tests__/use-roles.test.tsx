// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import type { ReactElement, ReactNode } from 'react';
import { useDeleteRole, useRole, useSaveRole } from '../use-roles';

const CONFLICT = 409;
const NO_CONTENT = 204;
const ROLE_ID = 10;

const DETAIL = {
  roleId: ROLE_ID,
  name: 'Support',
  permissions: ['sales.invoices.view'],
  members: [
    {
      staffId: 4,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.invalid',
      active: true,
    },
  ],
  memberCount: 1,
};

const wrapper = ({ children }: { readonly children: ReactNode }): ReactElement => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

describe('the roles hooks (FE-03: reads through SWR, writes never retried)', () => {
  beforeEach(() => {
    resetApiStatus();
  });
  afterEach(() => {
    delete http.defaults.adapter;
    vi.restoreAllMocks();
  });

  it('reads one role with the DETAIL schema, and nothing at all for a null id', async () => {
    const detail = fakeAdapter(200, DETAIL);
    http.defaults.adapter = detail.adapter;
    const { result } = renderHook(() => useRole(ROLE_ID), { wrapper });
    await waitFor(() => {
      expect(result.current.data?.members).toHaveLength(1);
    });
    expect(detail.calls[0]?.url).toBe(`/api/v1/identity/roles/${String(ROLE_ID)}`);

    const none = fakeAdapter(200, DETAIL);
    http.defaults.adapter = none.adapter;
    renderHook(() => useRole(null), { wrapper });
    expect(none.calls).toEqual([]);
  });

  it('posts a create and patches an update to the right paths, each answering the saved DETAIL (the form resets from it)', async () => {
    const save = fakeAdapter(200, DETAIL);
    http.defaults.adapter = save.adapter;
    const { result } = renderHook(() => useSaveRole(ROLE_ID), { wrapper });
    const created = await result.current.create.trigger({ name: 'Support', permissions: [] });
    const updated = await result.current.update.trigger({ name: 'Support' });
    expect(created.ok && created.data.members).toHaveLength(1);
    expect(updated.ok && updated.data.permissions).toEqual(['sales.invoices.view']);
    // No list or detail read follows a save: the screen updates the caches itself (D-36).
    expect(save.calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST /api/v1/identity/roles',
      `PATCH /api/v1/identity/roles/${String(ROLE_ID)}`,
    ]);
  });

  it('deletes with no body and surfaces the 409 as a resolved failure, never a throw', async () => {
    const remove = fakeAdapter(NO_CONTENT);
    http.defaults.adapter = remove.adapter;
    const { result } = renderHook(() => useDeleteRole(ROLE_ID), { wrapper });
    const ok = await result.current.trigger(undefined);
    expect(ok.ok).toBe(true);
    expect(remove.calls[0]?.method).toBe('DELETE');

    const refused = fakeAdapter(CONFLICT, problem(CONFLICT, 'ERP-IDENTITY-0006'));
    http.defaults.adapter = refused.adapter;
    const { result: second } = renderHook(() => useDeleteRole(ROLE_ID), { wrapper });
    const outcome = await second.current.trigger(undefined);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? null : outcome.code).toBe('ERP-IDENTITY-0006');
    // Exactly one attempt: a write is never retried (ADR-0031 §5).
    expect(refused.calls).toHaveLength(1);
  });
});
