import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { RolePage } from '../RolePage';
import { RolesListPage } from '../RolesListPage';
import { StaffListPage } from '../StaffListPage';
import { StaffMemberPage } from '../StaffMemberPage';

/**
 * The staff and role routes under Setup (plan 04.2-27): each list, a new member or role, and one
 * whose `[id]` takes a positive integer (passed as a number) or is `notFound()` (T-4.2-60).
 */
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('../RolePage', () => ({ RolePage: () => null }));
vi.mock('../RolesListPage', () => ({ RolesListPage: () => null }));
vi.mock('../StaffListPage', () => ({ StaffListPage: () => null }));
vi.mock('../StaffMemberPage', () => ({ StaffMemberPage: () => null }));

describe('/setup/staff', () => {
  it('the list, titled staff_members; /new, titled new_staff', async () => {
    const list = await import('../../../../../app/(shell)/setup/staff/page');
    const create = await import('../../../../../app/(shell)/setup/staff/new/page');
    expect(list.default().type).toBe(StaffListPage);
    expect(create.default().type).toBe(StaffMemberPage);
    expect(create.default().props).toEqual({ mode: 'create' });
    expect(await list.generateMetadata()).toEqual({ title: 'staff.staff_members' });
    expect(await create.generateMetadata()).toEqual({ title: 'staff.new_staff' });
  });

  it('[id]: a positive integer opens the member in edit mode, titled staff_member', async () => {
    const page = await import('../../../../../app/(shell)/setup/staff/[id]/page');
    const element = await page.default(routeProps({ id: '004' }));
    expect(element.type).toBe(StaffMemberPage);
    expect(element.props).toEqual({ mode: 'edit', id: 4 });
    expect(await page.generateMetadata()).toEqual({ title: 'staff.staff_member' });
  });

  it.each(NOT_IDS)('"%s" is not a staff member page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/staff/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('/setup/roles', () => {
  it('the list, titled staff_roles; /new, titled new_role', async () => {
    const list = await import('../../../../../app/(shell)/setup/roles/page');
    const create = await import('../../../../../app/(shell)/setup/roles/new/page');
    expect(list.default().type).toBe(RolesListPage);
    expect(create.default().type).toBe(RolePage);
    expect(create.default().props).toEqual({ mode: 'create' });
    expect(await list.generateMetadata()).toEqual({ title: 'staff.staff_roles' });
    expect(await create.generateMetadata()).toEqual({ title: 'staff.new_role' });
  });

  it('[id]: a positive integer opens the role in edit mode, titled roles_dt_name', async () => {
    const page = await import('../../../../../app/(shell)/setup/roles/[id]/page');
    const element = await page.default(routeProps({ id: '02' }));
    expect(element.type).toBe(RolePage);
    expect(element.props).toEqual({ mode: 'edit', id: 2 });
    expect(await page.generateMetadata()).toEqual({ title: 'staff.roles_dt_name' });
  });

  it.each(NOT_IDS)('"%s" is not a role page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/roles/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
