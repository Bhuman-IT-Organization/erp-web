// @vitest-environment happy-dom
import { useState } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StaffMember } from '@/features/staff/schemas/staff.schema';
import type { ApiResult } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useStaffMemberStatus } from '../use-staff-member-status';

const NO_CONTENT = 204;
const FORBIDDEN = 403;
const SERVICE_UNAVAILABLE = 503;
const RETRY_RANDOM = 0.005;

const ROW: StaffMember = {
  staffId: 7,
  email: 'someone@example.invalid',
  firstName: 'Jane',
  lastName: 'Doe',
  phoneNumber: null,
  profileImageUrl: null,
  profileImagePreviewUrl: null,
  isAdmin: false,
  roleId: null,
  roleName: null,
  active: true,
  dateCreated: '2026-01-02T20:30:00.000Z',
  lastLogin: null,
};

function Probe() {
  const { setActive, isMutating } = useStaffMemberStatus(ROW);
  const [outcome, setOutcome] = useState<ApiResult<StaffMember> | null>(null);
  return (
    <div>
      <button
        type="button"
        data-testid="deactivate"
        onClick={() => {
          void setActive(false).then(setOutcome);
        }}
      >
        {String(isMutating)}
      </button>
      <output data-testid="probe">{outcome === null ? 'none' : JSON.stringify(outcome)}</output>
    </div>
  );
}

const isolated = () =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map() }}>
      <Probe />
    </SWRConfig>,
  );

let fake: FakeAdapter;
const answer = (status: number, body?: unknown): void => {
  fake = fakeAdapter(status, body);
  http.defaults.adapter = fake.adapter;
};

const outcome = (): unknown => JSON.parse(screen.getByTestId('probe').textContent);

describe('the active toggle write', () => {
  afterEach(() => {
    delete http.defaults.adapter;
    vi.restoreAllMocks();
  });

  it('PATCHes members/:id/status; the 204 answers the SAVED row for replaceRowInLists and asks for no list page (D-36)', async () => {
    answer(NO_CONTENT);
    isolated();
    await userEvent.setup().click(screen.getByTestId('deactivate'));
    await waitFor(() => {
      expect(outcome()).toEqual({ ok: true, status: NO_CONTENT, data: { ...ROW, active: false } });
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.url).toBe('/api/v1/identity/members/7/status');
    expect(fake.calls[0]?.method).toBe('PATCH');
    expect(fake.calls[0]?.data).toEqual({ active: false });
    // No prefix revalidation of the member list: the caller swaps the row in place.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fake.calls).toHaveLength(1);
  });

  it('a refusal is a ConfirmOutcome { ok: false, code, retryAfterS } and never throws', async () => {
    answer(FORBIDDEN, problem(FORBIDDEN, 'ERP-AUTH-0005'));
    isolated();
    await userEvent.setup().click(screen.getByTestId('deactivate'));
    await waitFor(() => {
      expect(outcome()).toMatchObject({ ok: false, code: 'ERP-AUTH-0005', retryAfterS: null });
    });
  });

  it('is NEVER retried: a 503 answers once and the result says it failed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(RETRY_RANDOM);
    answer(SERVICE_UNAVAILABLE, problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'));
    isolated();
    await userEvent.setup().click(screen.getByTestId('deactivate'));
    await waitFor(() => {
      expect(outcome()).toMatchObject({ ok: false, code: 'ERP-UPSTREAM-0001' });
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fake.spy).toHaveBeenCalledTimes(1);
  });
});
