import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenNavigation, NAVIGATION, SETUP_NAVIGATION, type NavItem } from '../navigation';
import { PERMISSION_CODES, PERMISSIONS } from '../permissions';
import {
  ADMIN_GATE,
  GATED_ROUTES,
  isAdminGate,
  isAnyOfGate,
  navGateOf,
  ROUTE_GATES,
  routeGateIn,
  routeGateOf,
  type RouteGate,
} from '../route-gates';
import { routeIsAdminOnly, routePermission } from '../routes';

/**
 * The erp-web half of the one-route-one-gate fix (migration-lead decision 2026-09-24).
 * `/setup/roles` drifted because its gate was declared twice: this
 * repository's menu said `adminOnly: true`, the api's controller said `@Permissions(staff.roles.view)`
 * — with nothing comparing them.
 *
 * This file VERIFIES rather than restates: every assertion reads `ROUTE_GATES` and asks whether the
 * menu and the route helpers agree with it. erp-api's `src/v1/identity/__tests__/route-gates.spec.ts`
 * asks the same of its handlers' decorators. The two copies of the map (this repository's and
 * erp-api's `packages/contracts`) are kept equal by hand.
 *
 * Nothing here is a runtime control: the api gates every request whatever the browser rendered.
 */

/** Every declared item of both panels. */
const ALL: readonly NavItem[] = flattenNavigation([...NAVIGATION, ...SETUP_NAVIGATION]);

/** A Node href is one the menu does not flag `legacy` — i.e. a page this repository serves. */
const nodeItems = (): readonly NavItem[] =>
  ALL.filter((item) => item.legacy !== true && item.href !== undefined);

/** `/setup/roles/:id` as a concrete path (every `:name` segment becomes `12`), so the helpers can be asked a real pathname. */
const concrete = (route: string): string => route.replace(/:[a-z]+/g, '12');

describe('ROUTE_GATES (the mirror of @erp/contracts)', () => {
  it('is frozen and covers exactly the declared routes', () => {
    expect(Object.isFrozen(ROUTE_GATES)).toBe(true);
    expect(GATED_ROUTES).toEqual([
      '/setup/cost-centers',
      '/setup/cost-centers/:id',
      '/setup/cost-centers/new',
      '/setup/currencies',
      '/setup/currencies/:id',
      '/setup/currencies/new',
      '/setup/customer-groups',
      '/setup/customer-groups/:id',
      '/setup/customer-groups/new',
      '/setup/email-status',
      '/setup/email-templates',
      '/setup/email-templates/:id',
      '/setup/expense-categories',
      '/setup/expense-categories/:id',
      '/setup/expense-categories/new',
      '/setup/lead-sources',
      '/setup/lead-sources/:id',
      '/setup/lead-sources/new',
      '/setup/payment-modes',
      '/setup/payment-modes/:id',
      '/setup/payment-modes/new',
      '/setup/roles',
      '/setup/roles/:id',
      '/setup/roles/new',
      '/setup/sent-emails',
      '/setup/sent-emails/:id',
      '/setup/services',
      '/setup/services/:id',
      '/setup/services/new',
      '/setup/staff',
      '/setup/staff/:id',
      '/setup/staff/new',
      '/setup/taxes',
      '/setup/taxes/:id',
      '/setup/taxes/new',
      '/setup/ticket-priorities',
      '/setup/ticket-priorities/:id',
      '/setup/ticket-priorities/new',
      '/setup/ticket-statuses',
      '/setup/ticket-statuses/:id',
      '/setup/ticket-statuses/new',
    ]);
  });

  it('protects all Ticket Statuses pages with the administrator gate', () => {
    for (const route of [
      '/setup/ticket-statuses',
      '/setup/ticket-statuses/new',
      '/setup/ticket-statuses/:id',
    ]) {
      expect(ROUTE_GATES[route]).toBe(ADMIN_GATE);
    }
  });

  it('declares every value as a catalogue code, a list of distinct codes or the administrator flag, never a loose string', () => {
    for (const route of GATED_ROUTES) {
      const gate: RouteGate | undefined = ROUTE_GATES[route];
      expect(gate, `${route} has no gate`).toBeDefined();
      const declared =
        gate !== undefined &&
        (isAnyOfGate(gate)
          ? gate.length > 0 &&
            new Set(gate).size === gate.length &&
            gate.every((code) => PERMISSION_CODES.includes(code))
          : gate === ADMIN_GATE || PERMISSION_CODES.includes(gate));
      expect(
        declared,
        `${route}: ${String(gate)} is neither 'admin', a catalogue code nor a list of distinct codes`,
      ).toBe(true);
    }
  });

  it('gates the Email Templates list and editor on the mapped Perfex view code (04.3 D-09, O-1)', () => {
    expect(ROUTE_GATES['/setup/email-templates']).toBe(PERMISSIONS.settings.emailTemplates.view);
    expect(ROUTE_GATES['/setup/email-templates/:id']).toBe(
      PERMISSIONS.settings.emailTemplates.view,
    );
    expect(routePermission('/setup/email-templates/4')).toBe(
      PERMISSIONS.settings.emailTemplates.view,
    );
    expect(routeIsAdminOnly('/setup/email-templates')).toBe(false);
  });

  it('gates the sent-email log, its entries and the email status on the administrator flag (04.3 D-02, D-05, D-09)', () => {
    expect(ROUTE_GATES['/setup/sent-emails']).toBe(ADMIN_GATE);
    expect(routeIsAdminOnly('/setup/sent-emails')).toBe(true);
    expect(ROUTE_GATES['/setup/sent-emails/:id']).toBe(ADMIN_GATE);
    expect(routeIsAdminOnly('/setup/sent-emails/41')).toBe(true);
    expect(ROUTE_GATES['/setup/email-status']).toBe(ADMIN_GATE);
    expect(routeIsAdminOnly('/setup/email-status')).toBe(true);
  });

  it('isAnyOfGate is true for an array and false for a code or the administrator flag', () => {
    expect(isAnyOfGate([PERMISSIONS.staff.roles.view, PERMISSIONS.staff.members.view])).toBe(true);
    expect(isAnyOfGate(PERMISSIONS.staff.members.view)).toBe(false);
    expect(isAnyOfGate(ADMIN_GATE)).toBe(false);
  });

  it('answers the administrator routes through routeIsAdminOnly', () => {
    expect(routeIsAdminOnly('/setup/roles/4')).toBe(true);
    expect(routeIsAdminOnly('/setup/cost-centers/4')).toBe(true);
  });

  it('resolves a concrete pathname, ignores a query string and says nothing about an unknown path', () => {
    expect(routeGateOf('/setup/roles')).toBe(ADMIN_GATE);
    expect(routeGateOf('/setup/roles/12')).toBe(ADMIN_GATE);
    expect(routeGateOf('/setup/staff/12')).toBe(ROUTE_GATES['/setup/staff/:id']);
    expect(routeGateOf('/setup/staff?q=ann')).toBe(ROUTE_GATES['/setup/staff']);
    expect(routeGateOf('/admin/roles')).toBeUndefined();
    expect(routeGateOf('/setup/roles/12/edit')).toBeUndefined();
  });

  it('still gives /setup/staff/new and /setup/roles/7 the gates they have today', () => {
    expect(routeGateOf('/setup/staff/new')).toBe(ROUTE_GATES['/setup/staff/new']);
    expect(routeGateOf('/setup/roles/7')).toBe(ADMIN_GATE);
  });

  it('carries the route-gates registry marker pair inside the ROUTE_GATES literal, after the entries (03.2-17)', () => {
    // A new screen's three routes go between these markers, fail-closed on ADMIN_GATE
    // (erp-docs `05-templates/frontend-feature/README.md`).
    const text = readFileSync(join(import.meta.dirname, '..', 'route-gates.ts'), 'utf8');
    const literal = text.slice(text.indexOf('Object.freeze({'), text.indexOf('});'));
    const lines = literal.split('\n').map((line) => line.trim());
    const start = lines.indexOf('// registry start: route-gates');
    const end = lines.indexOf('// registry end: route-gates');
    expect(start, 'the start marker inside ROUTE_GATES').toBeGreaterThan(0);
    expect(end, 'the end marker after the start marker').toBeGreaterThan(start);
    expect(lines.slice(start + 1).filter((line) => line.startsWith("'/"))).toEqual([]);
  });

  it('turns a gate into the menu fields, one or the other and never both', () => {
    expect(navGateOf('/setup/roles')).toEqual({ adminOnly: true });
    expect(navGateOf('/setup/staff')).toEqual({ permission: ROUTE_GATES['/setup/staff'] });
    expect(navGateOf('/admin/clients')).toEqual({});
  });
});

describe('routeGateIn (exact key first, then an :id pattern — 03.2 RESEARCH Pitfall 6)', () => {
  // ':' (0x3A) sorts before 'n', so a pattern-only walk reaches '/x/:id' before '/x/new'.
  const GATES: Readonly<Record<string, RouteGate>> = { '/x/:id': 'a', '/x/new': 'b' };

  it('answers the exact key before an :id pattern: /x/new is b, not a', () => {
    expect(routeGateIn(GATES, '/x/new')).toBe('b');
  });

  it('resolves /setup/staff/new and /setup/roles/new through their own keys, not through /:id', () => {
    // Each real key mapped to its own name, so the answer says WHICH key matched.
    const own = Object.fromEntries(GATED_ROUTES.map((route) => [route, route]));
    expect(routeGateIn(own, '/setup/staff/new')).toBe('/setup/staff/new');
    expect(routeGateIn(own, '/setup/roles/new')).toBe('/setup/roles/new');
    expect(routeGateIn(own, '/setup/staff/12')).toBe('/setup/staff/:id');
  });

  it('matches an :id pattern for any other single segment, and ignores a query string', () => {
    expect(routeGateIn(GATES, '/x/12')).toBe('a');
    expect(routeGateIn(GATES, '/x/12?tab=1')).toBe('a');
  });

  it('says nothing about a path no key names', () => {
    expect(routeGateIn(GATES, '/y')).toBeUndefined();
    expect(routeGateIn(GATES, '/x')).toBeUndefined();
  });
});

describe('navigation.ts agrees with ROUTE_GATES', () => {
  it('declares every Node menu href in the map — a screen with no declared gate is a defect', () => {
    const undeclared = nodeItems()
      .map((item) => item.href ?? '')
      .filter((href) => !GATED_ROUTES.includes(href));
    expect(
      undeclared,
      'a Node route the menu points at is not declared in ROUTE_GATES (add it there, not here)',
    ).toEqual([]);
  });

  it.each(GATED_ROUTES.filter((route) => nodeItems().some((item) => item.href === route)))(
    '%s carries the flag and the code the map declares, and never both',
    (route) => {
      const item = nodeItems().find((entry) => entry.href === route);
      const gate = ROUTE_GATES[route];
      if (gate !== undefined && isAdminGate(gate)) {
        expect(item?.adminOnly, `${route} is gated 'admin'`).toBe(true);
        expect(
          item?.permission,
          `${route} is gated 'admin', so it declares no code`,
        ).toBeUndefined();
        return;
      }
      expect(item?.permission, `${route} must carry ${String(gate)}`).toBe(gate);
      expect(item?.adminOnly).toBeUndefined();
    },
  );
});

describe('routePermission and routeIsAdminOnly answer what ROUTE_GATES declares', () => {
  it.each(GATED_ROUTES)('%s', (route) => {
    const gate = ROUTE_GATES[route];
    const path = concrete(route);
    if (gate !== undefined && isAdminGate(gate)) {
      expect(routeIsAdminOnly(path), `${path} is administrator-only`).toBe(true);
      // The flag is not a permission code (ADR-0034 d.2), so this answers nothing.
      expect(routePermission(path)).toBeUndefined();
      return;
    }
    expect(routeIsAdminOnly(path)).toBe(false);
    expect(routePermission(path)).toBe(gate);
  });

  it('still answers from the menu for a Perfex path, which the map deliberately does not cover', () => {
    // Perfex's Leads > Email Integration screen is is_admin() in its menu (Cost Centers, then
    // Currencies were the example here until plans 04.1-19 and 04.1-29 moved them under /setup,
    // which the map now answers).
    expect(routeIsAdminOnly('/admin/leads/email_integration')).toBe(true);
    // The moved screens' Perfex paths are no longer in the menu, so the menu answers nothing.
    expect(routeIsAdminOnly('/admin/cost_centers')).toBe(false);
    expect(routePermission('/admin/invoices')).toEqual([
      'sales.invoices.view',
      'sales.invoices.viewOwn',
    ]);
    expect(routeIsAdminOnly('/nowhere')).toBe(false);
    expect(routePermission('/nowhere')).toBeUndefined();
  });
});

describe('the old paths declare no gate (plan 04.2-27)', () => {
  it.each(['/staff', '/roles/3'])('%s is undefined', (path) => {
    expect(routeGateOf(path)).toBeUndefined();
  });
});
