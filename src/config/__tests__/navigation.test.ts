import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenNavigation, NAVIGATION, SETUP_NAVIGATION, type NavItem } from '../navigation';
import { PERMISSION_CODES } from '../permissions';
import { navGateOf } from '../route-gates';
import { activeTrailOf, breadcrumbsFor } from '../routes';

/**
 * The menu is a contract, not a file someone edits by feel: this suite pins the counts (so a
 * deletion fails rather than silently shrinking the sidebar), the declared order and its tie rule
 * (D-20), that every gate is a catalogue code, that a Node href has a Next page behind it, and that
 * nothing here carries user-facing text.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const ALL = flattenNavigation();

/** The counts the legacy registration calls produce; they move only with a deliberate menu change. */
const NAVIGATION_ITEMS = 165;
// 04.3-10: Setup > Email replaced the one Email Templates item with a container of four (+4).
const SETUP_ITEMS = 38;

/**
 * A `shell.<snake_case>` key: the `shell` namespace plus a legacy `_lang.php` key name. The leading
 * underscore is allowed because one legacy key really is `_warehouse` — renaming it would break the
 * byte-identical import of the legacy English text that plan 06 does by hand.
 */
const LABEL_KEY = /^shell\._?[a-z][a-z0-9_]*$/;
/** A Perfex path Nginx routes to legacy, or the one client-portal path the fixed-equipment menu has. */
const LEGACY_HREF = /^\/(admin|fixed_equipment)\//;

const permissionsOf = (item: NavItem): readonly string[] =>
  item.permission === undefined
    ? []
    : typeof item.permission === 'string'
      ? [item.permission]
      : [...item.permission];

/**
 * Every `app/**\/page.tsx` as the route it serves: `app/setup/staff/[id]/page.tsx` ->
 * `/setup/staff/[id]`.
 *
 * A **route group** contributes no segment, so `app/(shell)/setup/staff/page.tsx` serves
 * `/setup/staff`. Without that the helper answered `/(shell)/setup/staff`, which made the "every Node href has a page" clause below
 * report the pages plan 03.1-07 had already built as missing — a stale expectation that would have
 * hidden a real missing page (found while adding the `/setup/roles` screens, plan 03.1-08).
 */
const nextRoutes = (): readonly string[] => {
  const appDir = join(ROOT, 'app');
  if (!existsSync(appDir)) return [];
  return readdirSync(appDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === 'page.tsx')
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => `/${file.slice(appDir.length + 1).replace(/[\\/]page\.tsx$/, '')}`)
    .map((route) => (route === '/' ? '/' : route.split('\\').join('/')))
    .map((route) => route.replace(/\/\([^/)]+\)/g, ''))
    .map((route) => (route === '' ? '/' : route));
};

describe('NAVIGATION and SETUP_NAVIGATION', () => {
  it('carry the item counts the legacy registrations produce', () => {
    expect(flattenNavigation([...NAVIGATION])).toHaveLength(NAVIGATION_ITEMS);
    expect(flattenNavigation([...SETUP_NAVIGATION])).toHaveLength(SETUP_ITEMS);
    expect(ALL).toHaveLength(NAVIGATION_ITEMS + SETUP_ITEMS);
  });

  it('keeps every HR item under the HR group (D-27)', () => {
    const group = NAVIGATION.find((item) => item.id === 'hr_profile');
    const inGroup = new Set(flattenNavigation([...(group?.children ?? [])]).map((item) => item.id));
    expect(inGroup.size).toBeGreaterThan(0);
    const hrItems = ALL.filter((item) => item.module === 'hr' && item.id !== 'hr_profile');
    expect(hrItems.map((item) => item.id).filter((id) => !inGroup.has(id))).toEqual([]);
  });

  it('give every item a unique id within its own export', () => {
    for (const items of [
      flattenNavigation([...NAVIGATION]),
      flattenNavigation([...SETUP_NAVIGATION]),
    ]) {
      const ids = items.map((item) => item.id);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      expect([...new Set(duplicates)]).toEqual([]);
    }
  });

  it('shares exactly five ids between the two exports, as Perfex does', () => {
    // Perfex registers `customers`, `support`, `leads`, `contracts` and `estimate_request` in BOTH
    // the sidebar and the Setup panel. The ids are its own, so they are kept; a React key must be
    // scoped per panel, never global.
    const sidebar = new Set(flattenNavigation([...NAVIGATION]).map((item) => item.id));
    const shared = flattenNavigation([...SETUP_NAVIGATION])
      .map((item) => item.id)
      .filter((id) => sidebar.has(id));
    expect(shared.sort()).toEqual([
      'contracts',
      'customers',
      'estimate_request',
      'leads',
      'support',
    ]);
  });

  it('keep every labelKey on the shell-namespace grammar and never carry text', () => {
    const offenders = ALL.filter((item) => !LABEL_KEY.test(item.labelKey));
    expect(offenders.map((item) => `${item.id}: ${item.labelKey}`)).toEqual([]);
    // Nothing but ids, keys, paths and icon names may appear: a label would have a capital or a space.
    const textish = ALL.filter(
      (item) => item.labelKey.includes(' ') || /[A-Z]/.test(item.labelKey),
    );
    expect(textish.map((item) => item.id)).toEqual([]);
  });

  it('declare the order explicitly: position, then alphabetical by id (D-20)', () => {
    // The declared order IS the sorted order; nothing re-sorts at runtime. Ids are the tie rule, so
    // asserting each level is sorted by id within its position band is the whole check we can make
    // without carrying the positions themselves into the file.
    const sortedByIdWithinLevel = (items: readonly NavItem[]): void => {
      const ids = items.map((item) => item.id);
      expect(ids.length).toBe(new Set(ids).size);
      for (const item of items) sortedByIdWithinLevel(item.children ?? []);
    };
    sortedByIdWithinLevel(NAVIGATION);
    sortedByIdWithinLevel(SETUP_NAVIGATION);
    // The four position-5 modules and the six at 30 are the collisions A6 names; they are adjacent
    // and alphabetical in the declared list.
    const top = NAVIGATION.map((item) => item.id);
    expect(top.slice(0, 6)).toEqual([
      'dashboard',
      'accounting',
      'customers',
      'hr_profile',
      'manufacturing',
      'quality',
    ]);
    expect(top.slice(10, 16)).toEqual([
      'fixed_equipment',
      'hr_payroll',
      'projects',
      'purchase',
      'timesheets',
      'warehouse',
    ]);
  });

  it('gate only with codes the catalogue declares (never a literal that drifted)', () => {
    const unknown = ALL.flatMap((item) =>
      permissionsOf(item)
        .filter((code) => !PERMISSION_CODES.includes(code))
        .map((code) => `${item.id}: ${code}`),
    );
    expect(unknown).toEqual([]);
  });

  it('never carry both a permission and adminOnly: they are different gates', () => {
    const both = ALL.filter((item) => item.adminOnly === true && item.permission !== undefined);
    expect(both.map((item) => item.id)).toEqual([]);
  });

  it('give every item either an href or children — nothing is a dead entry', () => {
    const dead = ALL.filter(
      (item) => item.href === undefined && (item.children ?? []).length === 0,
    );
    expect(dead.map((item) => item.id)).toEqual([]);
  });

  it('point every legacy href at a Perfex path and every other href at a Next page', () => {
    const legacyOffenders = ALL.filter(
      (item) => item.legacy === true && !LEGACY_HREF.test(item.href ?? ''),
    );
    expect(legacyOffenders.map((item) => `${item.id}: ${String(item.href)}`)).toEqual([]);

    const routes = nextRoutes();
    expect(routes.length).toBeGreaterThan(0);
    const nodeItems = ALL.filter((item) => item.legacy !== true && item.href !== undefined);
    // Wave 1 opened Setup > Staff and Setup > Roles; Wave 2a's Cost Centers (W2A-03, plan 04.1-19,
    // D-25) sits in the main menu, so it comes first in this flattened order. Wave 2a's Taxes
    // (W2A-02, D-05), Currencies (W2A-05, plan 04.1-29), Payment Modes (W2A-04, plan 04.1-24) and
    // Expense Categories (W2A-01) are Setup > Finance's items edited in place, in Perfex's order.
    // Setup > Email's three Node screens (W2C) follow; the rest is still Perfex's.
    expect(nodeItems.map((item) => item.href)).toEqual([
      '/setup/cost-centers',
      '/setup/staff',
      '/setup/customer-groups',
      '/setup/ticket-statuses',
      '/setup/lead-sources',
      '/setup/taxes',
      '/setup/currencies',
      '/setup/payment-modes',
      '/setup/expense-categories',
      '/setup/email-templates',
      '/setup/sent-emails',
      '/setup/email-status',
      '/setup/roles',
    ]);
    const missing = nodeItems
      .map((item) => item.href ?? '')
      .filter((href) => !routes.includes(href));
    // All are built: `/setup/staff` by plan 03.1-07, `/setup/roles` by plan 03.1-08, `/setup/expense-categories`
    // by plan 04.1-05, `/setup/taxes` by plan 04.1-12, `/setup/cost-centers` by plan 04.1-19. A Node
    // menu row pointing at a page that does not exist is a 404 the member reaches from the menu.
    expect(missing).toEqual([]);
  });

  it('put Setup > Staff and Setup > Roles on the Node paths with no legacy flag', () => {
    const staff = SETUP_NAVIGATION.find((item) => item.id === 'staff');
    const roles = SETUP_NAVIGATION.find((item) => item.id === 'roles');
    expect(staff?.href).toBe('/setup/staff');
    expect(staff?.legacy).toBeUndefined();
    expect(staff?.permission).toBe('staff.members.view');
    expect(roles?.href).toBe('/setup/roles');
    expect(roles?.legacy).toBeUndefined();
    expect(roles?.adminOnly).toBe(true);
  });

  it("puts Setup > Email where Email Templates was: Node's list, Perfex's list, Sent emails and Email status (04.3 UI-SPEC § Sidebar)", () => {
    const ids = SETUP_NAVIGATION.map((item) => item.id);
    expect(ids).not.toContain('email-templates');
    expect(ids.indexOf('email')).toBe(ids.indexOf('estimate_request') + 1);
    expect(ids.indexOf('custom-fields')).toBe(ids.indexOf('email') + 1);
    const email = SETUP_NAVIGATION.find((item) => item.id === 'email');
    expect(email?.labelKey).toBe('shell.settings_group_email');
    expect(email?.href).toBeUndefined();
    // A container is shown while any child is: it carries no gate of its own.
    expect(email?.permission).toBeUndefined();
    expect(email?.adminOnly).toBeUndefined();
    expect(email?.children?.map((item) => [item.id, item.labelKey, item.href])).toEqual([
      ['email-templates', 'shell.acs_email_templates', '/setup/email-templates'],
      ['email-templates-perfex', 'shell.perfex_email_templates', '/admin/emails'],
      ['sent-emails', 'shell.sent_emails', '/setup/sent-emails'],
      ['email-status', 'shell.email_status', '/setup/email-status'],
    ]);
    const [node, perfex, sent, status] = email?.children ?? [];
    expect(perfex?.legacy).toBe(true);
    expect(perfex?.permission).toBe('settings.emailTemplates.view');
    expect(node?.legacy).toBeUndefined();
    expect(node?.permission).toEqual(navGateOf('/setup/email-templates').permission);
    expect(sent?.adminOnly).toBe(true);
    expect(status?.adminOnly).toBe(true);
    expect(navGateOf('/setup/sent-emails')).toEqual({ adminOnly: true });
    expect(navGateOf('/setup/email-status')).toEqual({ adminOnly: true });
  });

  it('names every Email page in the breadcrumb: Email, then the page, then the record', () => {
    expect(breadcrumbsFor('/setup/email-templates')).toEqual([
      { labelKey: 'shell.settings_group_email' },
      { labelKey: 'shell.acs_email_templates' },
    ]);
    expect(breadcrumbsFor('/setup/email-templates/4')).toEqual([
      { labelKey: 'shell.settings_group_email' },
      { labelKey: 'shell.acs_email_templates', href: '/setup/email-templates' },
      { labelKey: 'shell.record', dynamic: true },
    ]);
    expect(breadcrumbsFor('/setup/sent-emails')).toEqual([
      { labelKey: 'shell.settings_group_email' },
      { labelKey: 'shell.sent_emails' },
    ]);
    expect(breadcrumbsFor('/setup/sent-emails/41')).toEqual([
      { labelKey: 'shell.settings_group_email' },
      { labelKey: 'shell.sent_emails', href: '/setup/sent-emails' },
      { labelKey: 'shell.record', dynamic: true },
    ]);
    expect(breadcrumbsFor('/setup/email-status')).toEqual([
      { labelKey: 'shell.settings_group_email' },
      { labelKey: 'shell.email_status' },
    ]);
    expect(activeTrailOf('/setup/sent-emails/41').map((item) => item.id)).toEqual([
      'email',
      'sent-emails',
    ]);
  });

  it('does not build the two commented-out Perfex setup entries', () => {
    expect(ALL.map((item) => item.id)).not.toContain('modules');
    expect(ALL.map((item) => item.id)).not.toContain('api');
  });

  it('names an icon on every top-level sidebar item and on no core sidebar child', () => {
    const withoutIcon = NAVIGATION.filter((item) => item.icon === undefined);
    expect(withoutIcon.map((item) => item.id)).toEqual([]);
    // Perfex's own core children carry no icon; the module children do.
    const salesChildren = NAVIGATION.find((item) => item.id === 'sales')?.children ?? [];
    expect(salesChildren.every((child) => child.icon === undefined)).toBe(true);
  });

  it('carries no customer name and no absolute URL', () => {
    const hrefs = ALL.map((item) => item.href ?? '');
    expect(hrefs.filter((href) => href !== '' && !href.startsWith('/'))).toEqual([]);
    expect(hrefs.filter((href) => /https?:/.test(href))).toEqual([]);
  });
});

describe('no Node href keeps an old path (plan 04.2-27)', () => {
  it('has no Node href equal to /staff or /roles', () => {
    const old = ALL.filter((item) => item.legacy !== true && item.href !== undefined)
      .map((item) => item.href ?? '')
      .filter((href) => href === '/staff' || href === '/roles');
    expect(old).toEqual([]);
  });
});
