import { describe, expect, it, vi } from 'vitest';
import type { NavItem } from '../navigation';
import { activeTrailOf, breadcrumbsFor, routeIsAdminOnly, routePermission } from '../routes';

/**
 * One made-up entry beside the real menu, for the precedence case only: it covers a path that
 * Setup > Roles' href already covers, deeper, and must never win (plan 04.2-28).
 */
const MADE_UP: NavItem = {
  id: 'zz-made-up',
  labelKey: 'shell.zz_made_up',
  href: '/zz-made-up',
  covers: ['/setup/roles/new'],
};
vi.mock('../navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navigation')>();
  return {
    ...real,
    flattenNavigation: (...args: Parameters<typeof real.flattenNavigation>) =>
      args.length === 0 ? [...real.flattenNavigation(), MADE_UP] : real.flattenNavigation(...args),
  };
});

/**
 * The six paths this phase routes plus the shapes that must NOT resolve. Everything here is derived
 * from `navigation.ts`, so a menu change that breaks a trail fails here rather than in a screenshot.
 */

describe('breadcrumbsFor', () => {
  it('builds Setup > Staff for the list, with the leaf not a link', () => {
    expect(breadcrumbsFor('/setup/staff')).toEqual([{ labelKey: 'shell.als_staff' }]);
  });

  it('builds Setup > Staff > New for the create path', () => {
    expect(breadcrumbsFor('/setup/staff/new')).toEqual([
      { labelKey: 'shell.als_staff', href: '/setup/staff' },
      { labelKey: 'shell.new' },
    ]);
  });

  it('marks a record crumb dynamic so the component renders a skeleton, never a guessed label', () => {
    expect(breadcrumbsFor('/setup/staff/12')).toEqual([
      { labelKey: 'shell.als_staff', href: '/setup/staff' },
      { labelKey: 'shell.record', dynamic: true },
    ]);
  });

  it('builds the roles trail the same way', () => {
    expect(breadcrumbsFor('/setup/roles')).toEqual([{ labelKey: 'shell.acs_roles' }]);
    expect(breadcrumbsFor('/setup/roles/new')).toEqual([
      { labelKey: 'shell.acs_roles', href: '/setup/roles' },
      { labelKey: 'shell.new' },
    ]);
    expect(breadcrumbsFor('/setup/roles/3')).toEqual([
      { labelKey: 'shell.acs_roles', href: '/setup/roles' },
      { labelKey: 'shell.record', dynamic: true },
    ]);
  });

  it('includes a container ancestor without a link, because Perfex gives it no href', () => {
    const trail = breadcrumbsFor('/admin/invoices');
    expect(trail).toEqual([{ labelKey: 'shell.als_sales' }, { labelKey: 'shell.invoices' }]);
  });

  it('ignores a query string and a trailing slash', () => {
    expect(breadcrumbsFor('/setup/staff?q=ann')).toEqual(breadcrumbsFor('/setup/staff'));
    expect(breadcrumbsFor('/setup/staff/')).toEqual(breadcrumbsFor('/setup/staff'));
  });

  it("ends a record tab's trail at the record, which the tab row then names (/setup/staff/12/notes)", () => {
    expect(breadcrumbsFor('/setup/staff/12/notes')).toEqual([
      { labelKey: 'shell.als_staff', href: '/setup/staff' },
      { labelKey: 'shell.record', dynamic: true },
    ]);
  });

  it('yields no crumbs for an unknown path and for the root', () => {
    expect(breadcrumbsFor('/nowhere')).toEqual([]);
    expect(breadcrumbsFor('/nowhere/12')).toEqual([]);
    expect(breadcrumbsFor('/nowhere/12/tab')).toEqual([]);
    expect(breadcrumbsFor('/setup/staff/new/tab')).toEqual([]);
    expect(breadcrumbsFor('/')).toEqual([]);
  });
});

describe('routePermission', () => {
  it('returns the declared gate of the matching item', () => {
    expect(routePermission('/setup/staff')).toBe('staff.members.view');
  });

  it('inherits the gate of the deepest covering item', () => {
    expect(routePermission('/setup/staff/12')).toBe('staff.members.view');
    expect(routePermission('/setup/staff/new')).toBe('staff.members.view');
  });

  it('returns the any-of array as declared, so the caller can offer either code', () => {
    expect(routePermission('/admin/invoices')).toEqual([
      'sales.invoices.view',
      'sales.invoices.viewOwn',
    ]);
  });

  it('is undefined for an unknown path and for an item Perfex leaves ungated', () => {
    expect(routePermission('/nowhere')).toBeUndefined();
    expect(routePermission('/admin/projects')).toBeUndefined();
  });
});

describe('routeIsAdminOnly', () => {
  it('is true for a path whose Perfex gate is is_admin()', () => {
    expect(routeIsAdminOnly('/setup/roles')).toBe(true);
    expect(routeIsAdminOnly('/setup/roles/3')).toBe(true);
    // Perfex's Leads > Email Integration screen: a Setup item with adminOnly and legacy.
    expect(routeIsAdminOnly('/admin/leads/email_integration')).toBe(true);
    // Cost Centers' and Currencies' gates moved with their pages: ROUTE_GATES answers them on
    // /setup (plans 04.1-19 and 04.1-29).
    expect(routeIsAdminOnly('/setup/cost-centers')).toBe(true);
    expect(routeIsAdminOnly('/setup/cost-centers/12')).toBe(true);
    expect(routeIsAdminOnly('/setup/currencies')).toBe(true);
    expect(routeIsAdminOnly('/setup/currencies/12')).toBe(true);
  });

  it('is false for a permission-gated path and for an unknown one', () => {
    expect(routeIsAdminOnly('/setup/staff')).toBe(false);
    expect(routeIsAdminOnly('/nowhere')).toBe(false);
  });
});

describe('activeTrailOf (D-16: the sidebar opens and marks the covering item)', () => {
  const idsOf = (pathname: string): readonly string[] =>
    activeTrailOf(pathname).map((item) => item.id);

  it('answers the Setup list with its Finance container, outermost first', () => {
    expect(idsOf('/setup/expense-categories')).toEqual(['finance', 'expenses-categories']);
  });

  it('answers the create path with the list item that covers it', () => {
    expect(idsOf('/setup/expense-categories/new')).toEqual(['finance', 'expenses-categories']);
  });

  it('answers a record path with the list item that covers it', () => {
    expect(idsOf('/setup/expense-categories/12')).toEqual(['finance', 'expenses-categories']);
  });

  it('answers a record under a root item with that item alone', () => {
    expect(idsOf('/setup/staff/12')).toEqual(['staff']);
  });

  it('answers the Cost Centers list with its Main Menu item alone (D-25: a root item, not Setup)', () => {
    expect(idsOf('/setup/cost-centers')).toEqual(['cost-centers']);
  });

  it('answers the Cost Centers create path with the Main Menu item that covers it', () => {
    expect(idsOf('/setup/cost-centers/new')).toEqual(['cost-centers']);
  });

  it('answers a Cost Centers record path with the Main Menu item that covers it', () => {
    expect(idsOf('/setup/cost-centers/12')).toEqual(['cost-centers']);
  });

  it('answers the Payment Modes list with its Finance container (W2A-04: a Setup item, so the Setup panel opens)', () => {
    expect(idsOf('/setup/payment-modes')).toEqual(['finance', 'payment-modes']);
  });

  it('answers the Payment Modes create path with the Setup item that covers it', () => {
    expect(idsOf('/setup/payment-modes/new')).toEqual(['finance', 'payment-modes']);
  });

  it('answers a Payment Modes record path with the Setup item that covers it', () => {
    expect(idsOf('/setup/payment-modes/12')).toEqual(['finance', 'payment-modes']);
  });

  it('answers the Currencies list with its Finance container (W2A-05: a Setup item, so the Setup panel opens)', () => {
    expect(idsOf('/setup/currencies')).toEqual(['finance', 'currencies']);
  });

  it('answers the Currencies create path with the Setup item that covers it', () => {
    expect(idsOf('/setup/currencies/new')).toEqual(['finance', 'currencies']);
  });

  it('answers a Currencies record path with the Setup item that covers it', () => {
    expect(idsOf('/setup/currencies/12')).toEqual(['finance', 'currencies']);
  });

  it('answers nothing for a path no menu item covers, the root included', () => {
    expect(idsOf('/login')).toEqual([]);
    expect(idsOf('/')).toEqual([]);
  });
});

describe('the trails follow the menu (plan 04.2-27)', () => {
  it('builds Setup > Staff > New for /setup/staff/new', () => {
    expect(breadcrumbsFor('/setup/staff/new')).toEqual([
      { labelKey: 'shell.als_staff', href: '/setup/staff' },
      { labelKey: 'shell.new' },
    ]);
  });
});

describe('the old paths have no trail (plan 04.2-27)', () => {
  it.each(['/staff', '/roles/3'])('%s yields no crumbs and no active trail', (path) => {
    expect(breadcrumbsFor(path)).toEqual([]);
    expect(activeTrailOf(path)).toEqual([]);
  });
});
