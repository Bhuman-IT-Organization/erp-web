// @vitest-environment happy-dom
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { RoleMember } from '@/features/staff/schemas/staff.schema';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import staffEn from '../../messages/en.json';
import { RoleMembers } from '../RoleMembers';

/**
 * The role's holders in their own card (legacy `roles/role.php` `col-md-5` panel, lead 2026-09-27):
 * one "Full Name" column of links, a search, the count and 10 per page with the kit Pager.
 */
const EN = staffEn.staff;
const COMMON = commonEn.common;

vi.mock('next/link', () => ({
  default: function NextLink({ href, ...rest }: ComponentProps<'a'> & { href: string }) {
    return <a href={href} data-next-link="" {...rest} />;
  },
}));

const member = (staffId: number, firstName: string, lastName: string): RoleMember => ({
  staffId,
  firstName,
  lastName,
  email: `m${String(staffId)}@example.invalid`,
  active: true,
});
const THREE: readonly RoleMember[] = [
  member(4, 'Ada', 'Lovelace'),
  member(5, 'Alan', 'Turing'),
  member(6, 'Grace', 'Hopper'),
];
/** 23 holders: the three above and 20 whose names share "Clerk", so ONE query matches 20 (> 10). */
const TWENTY_THREE: readonly RoleMember[] = [
  ...THREE,
  ...Array.from({ length: 20 }, (_, index) =>
    member(100 + index, 'Clerk', `Number ${String(index + 1)}`),
  ),
];

const table = () => screen.getByTestId('role-members');
const nameLinks = () => within(table()).getAllByRole('link');
const range = () => screen.getByTestId('pager-range').textContent;
const next = () => screen.getByRole('button', { name: COMMON.next });
const previous = () => screen.getByRole('button', { name: COMMON.previous });
const search = () => screen.getByRole('searchbox', { name: COMMON.search });

describe('RoleMembers: the members card (legacy col-md-5 panel, lead 2026-09-27)', () => {
  it('headed "Staff members using this role" (legacy key) and counting every holder: "Total Users: 3"', () => {
    renderWithProviders(<RoleMembers members={THREE} />);
    const region = screen.getByRole('region', { name: EN.staff_which_are_using_role });
    expect(within(region).getByRole('heading', { level: 2 }).textContent).toBe(
      'Staff members using this role',
    );
    expect(within(region).getByText('Total Users: 3')).toBeTruthy();
  });

  it('one column, "Full Name": each row is the member\'s name as a link to /setup/staff/:id, and no image', () => {
    const { container } = renderWithProviders(<RoleMembers members={THREE} />);
    expect(
      within(table())
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Full Name']);
    expect(nameLinks().map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Ada Lovelace', '/setup/staff/4'],
      ['Alan Turing', '/setup/staff/5'],
      ['Grace Hopper', '/setup/staff/6'],
    ]);
    expect(container.querySelector('img')).toBeNull();
  });

  it('past 10 holders the kit Pager pages them: "Showing 1–10 of 23", Next and Previous, no page-size picker, and a search typed on page 2 starts again on page 1; 10 or fewer show no pager', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<RoleMembers members={TWENTY_THREE} />);
    expect(range()).toBe('Showing 1–10 of 23');
    expect(nameLinks()).toHaveLength(10);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(previous().hasAttribute('disabled')).toBe(true);
    await user.click(next());
    expect(range()).toBe('Showing 11–20 of 23');
    await user.click(next());
    expect(range()).toBe('Showing 21–23 of 23');
    expect(nameLinks()).toHaveLength(3);
    expect(next().hasAttribute('disabled')).toBe(true);
    await user.click(previous());
    expect(range()).toBe('Showing 11–20 of 23');
    await user.type(search(), 'clerk');
    expect(range()).toBe('Showing 1–10 of 20');
    expect(nameLinks()).toHaveLength(10);
    unmount();
    renderWithProviders(<RoleMembers members={TWENTY_THREE.slice(0, 10)} />);
    expect(nameLinks()).toHaveLength(10);
    expect(screen.queryByTestId('pager-range')).toBeNull();
    expect(screen.queryByRole('button', { name: COMMON.next })).toBeNull();
  });

  it('the search filters by name as it is typed, ignoring case', async () => {
    renderWithProviders(<RoleMembers members={THREE} />);
    await userEvent.type(search(), 'TUR');
    expect(nameLinks().map((link) => link.textContent)).toEqual(['Alan Turing']);
  });

  it('a search that matches nobody says "No matches" and shows no table', async () => {
    renderWithProviders(<RoleMembers members={THREE} />);
    await userEvent.type(search(), 'zzz');
    expect(screen.getByText(COMMON.no_matches)).toBeTruthy();
    expect(screen.queryByTestId('role-members')).toBeNull();
    expect(screen.queryByTestId('pager-range')).toBeNull();
  });

  it('nobody holds the role: "No staff member holds this role yet.", with no search and no table', () => {
    renderWithProviders(<RoleMembers members={[]} />);
    expect(screen.getByText('No staff member holds this role yet.')).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByTestId('role-members')).toBeNull();
    expect(screen.queryByText(/Total Users/)).toBeNull();
  });

  it('while the role loads: a skeleton shaped like the card (its real heading, the search bar, name rows), busy, and no message (D-39)', () => {
    renderWithProviders(<RoleMembers members={undefined} />);
    const region = screen.getByRole('region', { name: EN.staff_which_are_using_role });
    const status = within(region).getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    // The count line, the search bar, the header and three name rows.
    expect(status.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText(EN.role_has_no_members)).toBeNull();
    expect(screen.queryByText(COMMON.no_matches)).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByTestId('role-members')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(<RoleMembers members={TWENTY_THREE} />, {
      locale: 'ar',
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
