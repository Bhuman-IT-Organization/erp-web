// @vitest-environment happy-dom
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it } from 'vitest';
import { http } from '@/lib/api/http';
import { fakeAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { useStaffMember } from '../use-staff-members';

const ROW = {
  staffId: 4,
  email: 'ada@example.invalid',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phoneNumber: null,
  isAdmin: false,
  roleId: 3,
  roleName: 'Support',
  active: true,
  dateCreated: '2026-01-02T20:30:00.000Z',
};

const DETAIL = {
  ...ROW,
  facebook: null,
  linkedin: null,
  skype: null,
  hourlyRate: 0,
  defaultLanguage: null,
  direction: null,
  emailSignature: null,
  mediaPathSlug: null,
  roleName: 'Support',
  isNotStaff: false,
  departmentIds: [2],
  permissions: ['sales.invoices.view'],
};

function OneProbe({ id }: { readonly id: number | null }) {
  const { data } = useStaffMember(id);
  return <output data-testid="probe" data-departments={String(data?.departmentIds.length ?? -1)} />;
}

const isolated = (ui: React.ReactElement) =>
  renderWithProviders(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);

let fake: FakeAdapter;
const answer = (body: unknown, status = 200): void => {
  fake = fakeAdapter(status, body);
  http.defaults.adapter = fake.adapter;
};

describe('the member reads', () => {
  afterEach(() => {
    delete http.defaults.adapter;
  });

  it('reads one member through the DETAIL schema, so the departments and permissions arrive', async () => {
    answer(DETAIL);
    isolated(<OneProbe id={4} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.departments).toBe('1');
    });
    expect(fake.calls[0]?.url).toBe('/api/v1/identity/members/4');
  });

  it('asks for nothing when there is no member to read (the create screen)', async () => {
    answer(DETAIL);
    isolated(<OneProbe id={null} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.calls).toEqual([]);
    expect(screen.getByTestId('probe').dataset.departments).toBe('-1');
  });
});
