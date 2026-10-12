// @vitest-environment happy-dom
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { useCommonApi } from '@/lib/api/use-common-api';
import { fakeAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { z } from 'zod';
import type { StaffMemberDetail } from '../../schemas/staff.schema';
import { useSaveStaffMember } from '../use-save-staff-member';

const CREATED = 201;
const BAD_REQUEST = 400;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;

/** What `POST`/`PATCH …/members` answer: the member as `GET …/members/:id` does (memberResponseSchema). */
const DETAIL = {
  staffId: 8,
  email: 'ada@example.invalid',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phoneNumber: null,
  facebook: null,
  linkedin: null,
  skype: null,
  hourlyRate: 0,
  defaultLanguage: null,
  emailSignature: null,
  mediaPathSlug: null,
  profileImageUrl: null,
  profileImagePreviewUrl: null,
  dateCreated: '2026-01-02T20:30:00.000Z',
  lastLogin: null,
  lastActivity: null,
  isAdmin: false,
  roleId: 3,
  roleName: 'Support',
  active: true,
  isNotStaff: false,
  departmentIds: [2],
  permissions: ['sales.invoices.view'],
};

let saved: StaffMemberDetail | undefined;
let outcome = 'none';

/** A mounted list page, to prove a save asks for no list again (D-36). */
function ListProbe() {
  useCommonApi('/api/v1/identity/members', z.unknown(), { q: 'probe' });
  return null;
}

function Probe({ id }: { readonly id: number | null }) {
  const { create, update } = useSaveStaffMember(id);
  const mutation = id === null ? create : update;
  return (
    <button
      type="button"
      data-testid="save"
      onClick={() => {
        void (
          id === null
            ? create.trigger({
                email: DETAIL.email,
                firstName: DETAIL.firstName,
                lastName: DETAIL.lastName,
                password: 'a-long-enough-password',
              })
            : update.trigger({ firstName: 'Grace' })
        ).then((result) => {
          if (result.ok) saved = result.data;
          outcome = result.ok
            ? 'ok'
            : `${result.code}|${String(result.retryAfterS)}|${result.issues === undefined ? 'no' : 'issues'}`;
        });
      }}
    >
      {String(mutation.isMutating)}
    </button>
  );
}

const isolated = (id: number | null) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ListProbe />
      <Probe id={id} />
    </SWRConfig>,
  );

let fake: FakeAdapter;
const answer = (status: number, body?: unknown): void => {
  fake = fakeAdapter(status, body);
  http.defaults.adapter = fake.adapter;
};
const saves = () => fake.calls.filter((call) => call.method !== 'GET');

describe('the member save (FE-08, FE-12, D-36)', () => {
  afterEach(() => {
    delete http.defaults.adapter;
    saved = undefined;
    outcome = 'none';
    resetApiStatus();
  });

  it('creates with one POST to the members path and answers the saved DETAIL record', async () => {
    answer(CREATED, DETAIL);
    isolated(null);
    await waitFor(() => {
      expect(fake.calls.filter((call) => call.method === 'GET')).toHaveLength(1);
    });
    await userEvent.setup().click(screen.getByTestId('save'));
    await waitFor(() => {
      expect(outcome).toBe('ok');
    });
    expect(saves()).toHaveLength(1);
    expect(saves()[0]?.url).toBe('/api/v1/identity/members');
    expect(saves()[0]?.method).toBe('POST');
    // The detail's own fields survive: the form resets from it and the detail cache holds it.
    expect(saved?.permissions).toEqual(['sales.invoices.view']);
    expect(saved?.departmentIds).toEqual([2]);
    // Nothing is invalidated by the hook: the screen decides which list pages ask again.
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(fake.calls.filter((call) => call.method === 'GET')).toHaveLength(1);
  });

  it('edits with one PATCH to the member path, and asks for no list page again (the caller swaps the row in)', async () => {
    answer(200, DETAIL);
    isolated(8);
    await waitFor(() => {
      expect(fake.calls.filter((call) => call.method === 'GET')).toHaveLength(1);
    });
    await userEvent.setup().click(screen.getByTestId('save'));
    await waitFor(() => {
      expect(outcome).toBe('ok');
    });
    expect(saves()[0]?.url).toBe('/api/v1/identity/members/8');
    expect(saves()[0]?.method).toBe('PATCH');
    expect(saves()[0]?.data).toEqual({ firstName: 'Grace' });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(fake.calls.filter((call) => call.method === 'GET')).toHaveLength(1);
  });

  it('hands a 400 back as { ok: false, code, retryAfterS, issues } instead of throwing', async () => {
    answer(BAD_REQUEST, {
      type: 'about:blank',
      status: BAD_REQUEST,
      title: 'ERP-VALIDATION-0001',
      code: 'ERP-VALIDATION-0001',
      issues: [{ path: ['email'], message: 'Invalid email' }],
    });
    isolated(null);
    await userEvent.setup().click(screen.getByTestId('save'));
    await waitFor(() => {
      expect(outcome).toBe('ERP-VALIDATION-0001|null|issues');
    });
  });

  it('is NEVER retried: a 503 answers once and the result says so', async () => {
    answer(SERVICE_UNAVAILABLE, {
      type: 'about:blank',
      status: SERVICE_UNAVAILABLE,
      title: 'x',
      code: 'ERP-UPSTREAM-0001',
    });
    isolated(8);
    await userEvent.setup().click(screen.getByTestId('save'));
    await waitFor(() => {
      expect(outcome.startsWith('ERP-UPSTREAM-0001')).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(saves()).toHaveLength(1);
  });
});
