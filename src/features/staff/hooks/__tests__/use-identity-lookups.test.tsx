// @vitest-environment happy-dom
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it } from 'vitest';
import { http } from '@/lib/api/http';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { useDepartments, usePermissionCatalogue, useRoleOptions } from '../use-identity-lookups';

const CATALOGUE = {
  data: [
    {
      module: 'sales',
      resources: [
        { resource: 'invoices', actions: [{ action: 'view', code: 'sales.invoices.view' }] },
      ],
    },
  ],
  meta: { total: 1 },
};
const DEPARTMENTS = { data: [{ departmentId: 2, name: 'Support' }], meta: { total: 1 } };
const ROLES = {
  data: [{ roleId: 3, name: 'Support', memberCount: 2 }],
  meta: { nextCursor: null },
};
const FORBIDDEN = 403;

function CatalogueProbe() {
  const { data } = usePermissionCatalogue();
  return <output data-testid="probe" data-total={String(data?.meta.total ?? -1)} />;
}

function DepartmentsProbe() {
  const { data } = useDepartments();
  return <output data-testid="probe" data-total={String(data?.meta.total ?? -1)} />;
}

function RolesProbe({ enabled }: { readonly enabled: boolean }) {
  const { data, error } = useRoleOptions(enabled);
  return (
    <output
      data-testid="probe"
      data-rows={String(data?.data.length ?? -1)}
      data-error={error === undefined ? 'none' : error.code}
    />
  );
}

const isolated = (ui: React.ReactElement) =>
  renderWithProviders(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);

let fake: FakeAdapter;
const answer = (status: number, body: unknown): void => {
  fake = fakeAdapter(status, body);
  http.defaults.adapter = fake.adapter;
};

describe('the identity lookups', () => {
  afterEach(() => {
    delete http.defaults.adapter;
  });

  it('reads the catalogue from the identity path, total and no cursor', async () => {
    answer(200, CATALOGUE);
    isolated(<CatalogueProbe />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.total).toBe('1');
    });
    expect(fake.calls[0]?.url).toBe('/api/v1/identity/permissions/catalogue');
  });

  it('reads the departments picker', async () => {
    answer(200, DEPARTMENTS);
    isolated(<DepartmentsProbe />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.total).toBe('1');
    });
    expect(fake.calls[0]?.url).toBe('/api/v1/identity/departments');
  });

  it('asks for the roles only when enabled (a non-admin is offered no role options)', async () => {
    answer(200, ROLES);
    isolated(<RolesProbe enabled={false} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.calls).toEqual([]);
  });

  it('reads the roles with a limit when enabled, and a refusal stays an error of its own', async () => {
    answer(200, ROLES);
    isolated(<RolesProbe enabled={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.rows).toBe('1');
    });
    expect(fake.calls[0]?.url).toBe('/api/v1/identity/roles?limit=200');

    answer(FORBIDDEN, problem(FORBIDDEN, 'ERP-AUTH-0005'));
    isolated(<RolesProbe enabled={true} />);
    await waitFor(() => {
      expect(screen.getAllByTestId('probe').at(-1)?.dataset.error).toBe('ERP-AUTH-0005');
    });
  });
});
