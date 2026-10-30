import { PERMISSIONS, type PermissionCode } from './permissions';

/**
 * Mirrors `@erp/contracts`' `ROUTE_GATES` — erp-api `packages/contracts/src/route-gates.ts` — the
 * single place the gate on each migrated route is written down. Copied by hand for the same reason
 * `config/permissions.ts` copies the permission catalogue: erp-web has no dependency on erp-api and
 * `@erp/contracts` is an erp-api workspace package (ADR-0007), so the shared declaration arrives as
 * a mirror and a drift gate rather than as an import.
 *
 * ## Why the map exists
 *
 * `/setup/roles` was gated twice: this repository's `config/navigation.ts` said `adminOnly: true` while
 * the api's controller said `@Permissions(staff.roles.view)`, so a non-administrator holding that one
 * code could read every role's full permission template through an endpoint no screen exercised.
 * Nothing compared the two declarations, so nothing could notice (migration-lead decision
 * 2026-09-24). `navigation.ts` and `routes.ts` now DERIVE a
 * Node route's gate from this map instead of restating it.
 *
 * ## THIS IS NOT A RUNTIME AUTHORISATION SOURCE
 *
 * The api is the only boundary. Every request is gated server-side and answers 401/403 whatever the
 * browser rendered; this map decides which menu rows appear and which screens refuse before asking,
 * which is a courtesy to the member and a test oracle — never a control. A screen that treated it as
 * one would be trusting a value the browser can edit.
 *
 * ## What keeps the copy honest
 *
 * - it is kept in sync with erp-api's `packages/contracts` by hand: a route → gate pair added or
 *   changed there is added or changed here in the same change;
 * - `src/config/__tests__/route-gates.test.ts` asserts `navigation.ts`'s `adminOnly` flags and
 *   `routePermission`/`routeIsAdminOnly`'s answers equal this map, and that every Node menu href is
 *   declared here. erp-api's `src/v1/identity/__tests__/route-gates.spec.ts` does the same against
 *   its handlers' decorators.
 *
 * A gate value is a `PERMISSIONS` constant, never a string literal (`S_PERMISSION_LITERAL`, D-16):
 * `config/permissions.ts` stays the one home of a clean permission name in this repository.
 */

/**
 * The administrator flag as a gate value — `tblstaff.admin = 1`, read from the session's
 * `/api/v1/auth/me` payload. ADR-0034 decision 2 says no permission code may express it, because a
 * code can be handed out by the mechanism it protects.
 */
export const ADMIN_GATE = 'admin';

/**
 * What a route may be gated on: one clean permission code, an any-of list of codes, or the
 * administrator flag.
 *
 * `PermissionCode` widens to `string` (the catalogue's leaves are `as const` values, not a closed
 * type), so the second constituent adds nothing the compiler can use — it is written anyway because
 * it is the whole point of the map: a reader must see that `'admin'` is an admitted value and not a
 * typo, and `isAdminGate` is the narrowing every caller switches on. The api's copy carries the same
 * type and the same disable.
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- `'admin'` is documentation the compiler cannot express while PermissionCode is `string`, and the array form is the any-of gate; see the docblock above.
export type RouteGate = PermissionCode | readonly PermissionCode[] | typeof ADMIN_GATE;

/**
 * Route → gate, frozen, byte-equal to the api's map. Keys are erp-web route paths; a key's dynamic
 * segment is any `:name`. A value may also be an any-of array of codes (plan 04.2-02): holding any
 * one admits; the first is the widest, as `@PermissionsAny` expects. A route is listed once its
 * screen is built or planned in the current phase; staff and roles live under `/setup`.
 */
export const ROUTE_GATES: Readonly<Record<string, RouteGate>> = Object.freeze({
  '/setup/staff': PERMISSIONS.staff.members.view,
  '/setup/staff/new': PERMISSIONS.staff.members.view,
  '/setup/staff/:id': PERMISSIONS.staff.members.view,
  '/setup/roles': ADMIN_GATE,
  '/setup/roles/new': ADMIN_GATE,
  '/setup/roles/:id': ADMIN_GATE,
  '/setup/expense-categories': ADMIN_GATE,
  '/setup/expense-categories/new': ADMIN_GATE,
  '/setup/expense-categories/:id': ADMIN_GATE,
  '/setup/email-templates': PERMISSIONS.settings.emailTemplates.view,
  '/setup/email-templates/:id': PERMISSIONS.settings.emailTemplates.view,
  '/setup/sent-emails': ADMIN_GATE,
  '/setup/sent-emails/:id': ADMIN_GATE,
  '/setup/email-status': ADMIN_GATE,
  '/setup/taxes': ADMIN_GATE,
  '/setup/taxes/new': ADMIN_GATE,
  '/setup/taxes/:id': ADMIN_GATE,
  '/setup/cost-centers': ADMIN_GATE,
  '/setup/cost-centers/new': ADMIN_GATE,
  '/setup/cost-centers/:id': ADMIN_GATE,
  '/setup/payment-modes': ADMIN_GATE,
  '/setup/payment-modes/new': ADMIN_GATE,
  '/setup/payment-modes/:id': ADMIN_GATE,
  '/setup/currencies': ADMIN_GATE,
  '/setup/currencies/new': ADMIN_GATE,
  '/setup/currencies/:id': ADMIN_GATE,
  '/setup/services': ADMIN_GATE,
  '/setup/services/new': ADMIN_GATE,
  '/setup/services/:id': ADMIN_GATE,
  '/setup/lead-sources': ADMIN_GATE,
  '/setup/lead-sources/new': ADMIN_GATE,
  '/setup/lead-sources/:id': ADMIN_GATE,

  '/setup/ticket-statuses': ADMIN_GATE,
  '/setup/ticket-statuses/new': ADMIN_GATE,
  '/setup/ticket-statuses/:id': ADMIN_GATE,
  '/setup/customer-groups': ADMIN_GATE,
  '/setup/customer-groups/new': ADMIN_GATE,
  '/setup/customer-groups/:id': ADMIN_GATE,
  // A new screen's three routes go between these markers, each on ADMIN_GATE: fail closed until the
  // module declares its own view code here AND in @erp/contracts (kept in sync by hand).
  // registry start: route-gates
  // registry end: route-gates
});

/** Every declared route path, sorted — the set the verifying test enumerates. */
export const GATED_ROUTES: readonly string[] = Object.keys(ROUTE_GATES).sort();

/** True when the route is gated on the administrator flag rather than on a permission code. */
export function isAdminGate(gate: RouteGate): gate is typeof ADMIN_GATE {
  return gate === ADMIN_GATE;
}

/** True when the route admits a member holding any one of a list of codes (plan 04.2-02). */
export function isAnyOfGate(gate: RouteGate): gate is readonly PermissionCode[] {
  return Array.isArray(gate);
}

/**
 * Pure: the gate `gates` declares for a concrete pathname. An exact key wins (`/setup/staff/new`), then
 * the first key in sorted order whose dynamic segments match, where any declared `:name` segment
 * (`:id`, `:tab`) matches one path segment (`/setup/roles/12` → `/setup/roles/:id`). The exact pass must come
 * first: `':'` sorts before every letter, so a pattern-only walk reached `/x/:id` before `/x/new`
 * (03.2 RESEARCH Pitfall 6): harmless while both carry one gate, wrong the day a create screen is
 * gated apart from a view. A query string is
 * ignored. `undefined` means the map says nothing about the path — which is not "allowed": the api
 * still decides, and for a Perfex path the menu item's own gate is what `routes.ts` falls back to.
 */
export function routeGateIn(
  gates: Readonly<Record<string, RouteGate>>,
  pathname: string,
): RouteGate | undefined {
  const path = pathname.split('?')[0] ?? '';
  if (Object.hasOwn(gates, path)) return gates[path];
  const segments = path.split('/').filter((part) => part !== '');
  for (const route of Object.keys(gates).sort()) {
    const declared = route.split('/').filter((part) => part !== '');
    if (declared.length !== segments.length) continue;
    const matches = declared.every(
      (segment, index) => segment.startsWith(':') || segment === segments[index],
    );
    if (matches) return gates[route];
  }
  return undefined;
}

/** The gate `ROUTE_GATES` declares for a pathname — `routeGateIn` over this repository's map. */
export function routeGateOf(pathname: string): RouteGate | undefined {
  return routeGateIn(ROUTE_GATES, pathname);
}

/**
 * The menu fields a Node route's declared gate produces — spread into the `NavItem` so the flag and
 * the code are never typed twice. An absent property is deliberate (`exactOptionalPropertyTypes`):
 * a route gated on the flag carries no `permission`, and one gated on a code carries no `adminOnly`.
 * An any-of gate returns the same array as `permission`, which `canAny` reads as "any one of".
 */
export function navGateOf(route: string): {
  readonly permission?: PermissionCode | readonly PermissionCode[];
  readonly adminOnly?: true;
} {
  const gate = routeGateOf(route);
  if (gate === undefined) return {};
  return isAdminGate(gate) ? { adminOnly: true } : { permission: gate };
}
