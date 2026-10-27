import { PERMISSIONS, type PermissionCode } from './permissions';
import { navGateOf } from './route-gates';

/**
 * The declared menu (FE-16): the ONE source for the sidebar, the breadcrumbs (`routes.ts`) and the
 * route guards. 1:1 with Perfex's `application/helpers/menu_helper.php` plus the nine module
 * bootstraps, read for ids, positions, icons, gates and `_lang.php` KEY names only — never for text.
 *
 * ## Order (D-20)
 *
 * Perfex sorts by `position` and, where positions collide, by module load order — which depends on
 * the order `tblmodules` happens to return, so "the same order" is not determined by the data (A6).
 * The order below is therefore DECLARED, and the tie rule is **alphabetical by item id**, applied at
 * every level. Four modules register at position 5 and five at 30, so the rule is load-bearing, not
 * decorative. Nothing sorts this list at runtime: it is already in order.
 *
 * ## Gates
 *
 * `permission` is a constant from `./permissions` (the `@erp/contracts` mirror) — never a literal
 * (D-16, the `S_PERMISSION_LITERAL` lint). An array means ANY of, which is how Perfex's
 * `view`/`view_own` pair reads (D-09). Absent means always visible.
 *
 * **A Node route's gate is NOT declared here.** `navGateOf('/setup/staff')` reads `ROUTE_GATES` in
 * `./route-gates.ts` — the mirror of `@erp/contracts`' one declaration — and spreads the resulting
 * `permission` or `adminOnly` into the item. That indirection exists because these two fields were
 * the drifting half of a gate written down twice: this file said `/setup/roles` was `adminOnly` while the
 * api gated it on `staff.roles.view` (migration-lead decision 2026-09-24). Every item whose href is
 * a **Perfex** path keeps its own gate below: Perfex authorises those screens, so there is no second
 * declaration to drift from.
 *
 * `adminOnly` is the third state and it is NOT in the plan's `<interfaces>`: many Perfex items are
 * gated by `is_admin()` alone, which ADR-0034 d.2 says no permission code may express. Dropping the
 * gate would put `cost-centers`, `leads`, `support`, the whole Setup panel and more in front of every
 * member (T-3.1-32), so the flag is recorded here and honoured by the Sidebar's filter.
 *
 * A container (no `href`) is visible when any child of it is — that is Perfex's own behaviour, where
 * the parent's `if` is the OR of its children's gates. `href` is therefore optional, which the plan's
 * `<interfaces>` also did not foresee.
 *
 * ## `legacy: true`
 *
 * The href is a Perfex path Nginx routes to legacy. The Node items today: Main Menu > Cost Centers
 * (`/setup/cost-centers`), Setup > Staff (`/setup/staff`), Setup > Finance > Taxes
 * (`/setup/taxes`), Setup > Finance > Currencies (`/setup/currencies`), Setup > Finance > Payment
 * Modes (`/setup/payment-modes`), Setup > Finance > Expenses Categories
 * (`/setup/expense-categories`) and Setup > Roles (`/setup/roles`), and they carry no flag; so do
 * the three Node screens of Setup > Email (Email Templates, Sent emails, Email status), whose
 * container also holds Perfex's own Email Templates list. Each `legacy: true` item is deleted by
 * the phase that migrates its screen.
 *
 * ## `covers`
 *
 * A Node page with no menu entry of its own is marked through the entry that declares its path
 * prefix in `covers`: the sidebar marks that row, Perfex's or Node's, and the breadcrumb ends at it;
 * the page adds any further crumbs with `useBreadcrumbCrumbs`. An href match always wins, so a
 * `covers` line stops mattering the day its own entry points at the page (plan 04.2-28).
 *
 * ## What is deliberately NOT here
 *
 * - Perfex's per-ticket-status children of `support` and per-warehouse children of `warehouse`: they
 *   are rows in a table, registered at runtime, not declared menu items.
 * - The two commented-out Setup entries (`modules`, `api`): not built.
 * - Every `labelKey` is `shell.<legacy _lang.php key>` so plan 06 can import the English text
 *   byte-identically from the legacy language packs. Keys are NOT unique across items: Perfex shows the
 *   same word in several places (`reports`, `settings`, `items`, `contracts`, `invoices`, `support`,
 *   `tasks`), and renaming them to be unique would break that import. Item ids are unique.
 */
export interface NavItem {
  /** The Perfex registration id (a child's `slug`); unique across both exports, and the tie-break key. */
  readonly id: string;
  /** A key in the `shell` namespace — never text (FE-19). */
  readonly labelKey: string;
  /** A key of `src/assets/icons/registry.json`; children mostly carry none in Perfex. */
  readonly icon?: string;
  /** A Node path, or a Perfex path when `legacy` is true. Absent = a container that only discloses children. */
  readonly href?: string;
  /** A catalogue constant, or an array meaning ANY of (the view/viewOwn pair). */
  readonly permission?: PermissionCode | readonly PermissionCode[];
  /** The Perfex gate is `is_admin()`; no permission code can express it (ADR-0034 d.2). */
  readonly adminOnly?: true;
  /** The owning module, for the module filter and the breadcrumb trail. */
  readonly module?: string;
  /** Nginx routes this href to Perfex; deleted by the phase that migrates the screen. */
  readonly legacy?: true;
  /**
   * Node path prefixes (the path itself or anything under it, on a segment boundary) this entry marks and
   * gives its trail to when no entry's href covers the path (plan 04.2-28; 04.6-UI-SPEC § Sidebar). Never
   * a Perfex path. The deepest href match always wins over a `covers` match.
   */
  readonly covers?: readonly string[];
  readonly children?: readonly NavItem[];
}

/** The main sidebar (`aside.php`), core items and the nine modules merged, in declared order. */
export const NAVIGATION: readonly NavItem[] = [
  {
    id: 'dashboard',
    labelKey: 'shell.als_dashboard',
    icon: 'object-group',
    href: '/admin/',
    legacy: true,
  },
  {
    id: 'accounting',
    labelKey: 'shell.als_accounting',
    icon: 'usd',
    module: 'accounting',
    children: [
      {
        id: 'accounting_dashboard',
        labelKey: 'shell.dashboard',
        icon: 'home',
        href: '/admin/accounting/dashboard',
        permission: PERMISSIONS.accounting.dashboard.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_banking',
        labelKey: 'shell.banking',
        icon: 'university',
        href: '/admin/accounting/banking?group=bank_accounts',
        permission: PERMISSIONS.accounting.banking.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_registers',
        labelKey: 'shell.registers',
        icon: 'list',
        href: '/admin/accounting/registers',
        permission: PERMISSIONS.accounting.registers.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_transaction',
        labelKey: 'shell.transaction',
        icon: 'file',
        href: '/admin/accounting/transaction?group=sales',
        permission: PERMISSIONS.accounting.transaction.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_bills',
        labelKey: 'shell.bills',
        icon: 'book',
        href: '/admin/accounting/bills',
        permission: PERMISSIONS.accounting.bills.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_checks',
        labelKey: 'shell.acc_checks',
        icon: 'book',
        href: '/admin/accounting/checks',
        permission: PERMISSIONS.accounting.checks.view,
        module: 'accounting',
        legacy: true,
      },
      // its label is a literal in Perfex, so the key is ours; it shares the checks gate
      {
        id: 'accounting_cheque_management',
        labelKey: 'shell.cheque_management',
        icon: 'check-square-o',
        href: '/admin/accounting/cheque_management',
        permission: PERMISSIONS.accounting.checks.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_journal_entry',
        labelKey: 'shell.journal_entry',
        icon: 'book',
        href: '/admin/accounting/journal_entry',
        permission: PERMISSIONS.accounting.journalEntry.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_transfer',
        labelKey: 'shell.acc_transfer',
        icon: 'exchange',
        href: '/admin/accounting/transfer',
        permission: PERMISSIONS.accounting.transfer.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_chart_of_accounts',
        labelKey: 'shell.chart_of_accounts',
        icon: 'list-ol',
        href: '/admin/accounting/chart_of_accounts',
        permission: PERMISSIONS.accounting.chartOfAccounts.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_reconcile',
        labelKey: 'shell.reconcile',
        icon: 'sliders',
        href: '/admin/accounting/reconcile',
        permission: PERMISSIONS.accounting.reconcile.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_budget',
        labelKey: 'shell.budget',
        icon: 'exchange',
        href: '/admin/accounting/budget',
        permission: PERMISSIONS.accounting.budget.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_report',
        labelKey: 'shell.reports',
        icon: 'area-chart',
        href: '/admin/accounting/report',
        permission: PERMISSIONS.accounting.reports.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_vendor',
        labelKey: 'shell.vendors',
        icon: 'users',
        href: '/admin/accounting/vendors',
        permission: PERMISSIONS.accounting.vendor.view,
        module: 'accounting',
        legacy: true,
      },
      {
        id: 'accounting_setting',
        labelKey: 'shell.setting',
        icon: 'cog',
        href: '/admin/accounting/setting?group=general',
        permission: PERMISSIONS.accounting.settings.view,
        module: 'accounting',
        legacy: true,
      },
    ],
  },
  // Perfex also opens this to a member with assigned customers, or with `create` on customers; `viewOwn` is that branch's clean analogue
  {
    id: 'customers',
    labelKey: 'shell.als_clients',
    icon: 'user',
    href: '/admin/clients',
    permission: [PERMISSIONS.crm.customers.view, PERMISSIONS.crm.customers.viewOwn],
    module: 'crm',
    legacy: true,
  },
  {
    id: 'hr_profile',
    labelKey: 'shell.hr_hr_profile',
    icon: 'users',
    module: 'hr',
    children: [
      {
        id: 'hr_profile_dashboard',
        labelKey: 'shell.hr_dashboard',
        icon: 'dashboard',
        href: '/admin/hr_profile/dashboard',
        permission: PERMISSIONS.hr.dashboard.view,
        module: 'hr',
        legacy: true,
      },
      {
        id: 'hr_profile_job_position_manage',
        labelKey: 'shell.hr_job_descriptions',
        icon: 'map-pin',
        href: '/admin/hr_profile/job_positions',
        permission: [PERMISSIONS.hr.jobPosition.view, PERMISSIONS.hr.jobPosition.viewOwn],
        module: 'hr',
        legacy: true,
      },
      {
        id: 'hr_profile_organizational_chart',
        labelKey: 'shell.hr_organizational_chart',
        icon: 'th-list',
        href: '/admin/hr_profile/organizational_chart',
        permission: [PERMISSIONS.hr.orgchart.view, PERMISSIONS.hr.orgchart.viewOwn],
        module: 'hr',
        legacy: true,
      },
      {
        id: 'hr_profile_reception_of_staff',
        labelKey: 'shell.hr_receiving_staff_lable',
        icon: 'edit',
        href: '/admin/hr_profile/reception_staff',
        permission: [PERMISSIONS.hr.receptionStaff.view, PERMISSIONS.hr.receptionStaff.viewOwn],
        module: 'hr',
        legacy: true,
      },
      {
        id: 'hr_profile_hr_records',
        labelKey: 'shell.hr_hr_records',
        icon: 'user',
        href: '/admin/hr_profile/staff_infor',
        permission: [PERMISSIONS.hr.records.view, PERMISSIONS.hr.records.viewOwn],
        module: 'hr',
        legacy: true,
      },
      {
        id: 'hr_profile_training',
        labelKey: 'shell.hr_training',
        icon: 'graduation-cap',
        href: '/admin/hr_profile/training?group=training_program',
        permission: PERMISSIONS.hr.training.view,
        module: 'hr',
        legacy: true,
      },
      {
        id: 'hr_profile_contract',
        labelKey: 'shell.hr_hr_contracts',
        icon: 'file-contract',
        href: '/admin/hr_profile/contracts',
        permission: [PERMISSIONS.hr.contract.view, PERMISSIONS.hr.contract.viewOwn],
        module: 'hr',
        legacy: true,
      },
      {
        id: 'hr_profile_dependent_person',
        labelKey: 'shell.hr_dependent_persons',
        icon: 'address-card',
        href: '/admin/hr_profile/dependent_persons',
        permission: [PERMISSIONS.hr.dependentPerson.view, PERMISSIONS.hr.dependentPerson.viewOwn],
        module: 'hr',
        legacy: true,
      },
      {
        id: 'hr_profile_quitting_works',
        labelKey: 'shell.hr_resignation_procedures',
        icon: 'user-times',
        href: '/admin/hr_profile/resignation_procedures',
        permission: [
          PERMISSIONS.hr.proceduresForQuittingWork.view,
          PERMISSIONS.hr.proceduresForQuittingWork.viewOwn,
        ],
        module: 'hr',
        legacy: true,
      },
      {
        id: 'hr_profile_q_a',
        labelKey: 'shell.hr_q_a',
        icon: 'question-circle',
        href: '/admin/hr_profile/knowledge_base_q_a',
        permission: PERMISSIONS.hr.manageQA.view,
        module: 'hr',
        legacy: true,
      },
      {
        id: 'hr_profile_reports',
        labelKey: 'shell.hr_reports',
        icon: 'list-alt',
        href: '/admin/hr_profile/reports',
        permission: PERMISSIONS.hr.reports.view,
        module: 'hr',
        legacy: true,
      },
      {
        id: 'hr_profile_setting',
        labelKey: 'shell.hr_settings',
        icon: 'cogs',
        href: '/admin/hr_profile/setting?group=contract_type',
        permission: PERMISSIONS.hr.settings.view,
        module: 'hr',
        legacy: true,
      },
    ],
  },
  // every child carries the module's single gate: Perfex declares one `manufacturing` feature, so the catalogue has one resource, `manufacturing.orders`
  {
    id: 'manufacturing',
    labelKey: 'shell.manufacturing_name',
    icon: 'industry',
    module: 'manufacturing',
    children: [
      {
        id: 'manufacturing_dashboard',
        labelKey: 'shell.mrp_dashboard',
        icon: 'dashboard',
        href: '/admin/manufacturing/dashboard',
        permission: PERMISSIONS.manufacturing.orders.view,
        module: 'manufacturing',
        legacy: true,
      },
      {
        id: 'manufacturing_product_management',
        labelKey: 'shell.mrp_products',
        icon: 'th-list',
        href: '/admin/manufacturing/product_management',
        permission: PERMISSIONS.manufacturing.orders.view,
        module: 'manufacturing',
        legacy: true,
      },
      {
        id: 'manufacturing_reception_of_staff',
        labelKey: 'shell.mrp_product_variants',
        icon: 'edit',
        href: '/admin/manufacturing/product_variant_management',
        permission: PERMISSIONS.manufacturing.orders.view,
        module: 'manufacturing',
        legacy: true,
      },
      {
        id: 'manufacturing_hr_records',
        labelKey: 'shell.mrp_bills_of_materials',
        icon: 'align-justify',
        href: '/admin/manufacturing/bill_of_material_manage',
        permission: PERMISSIONS.manufacturing.orders.view,
        module: 'manufacturing',
        legacy: true,
      },
      {
        id: 'manufacturing_training',
        labelKey: 'shell.mrp_routings',
        icon: 'cogs',
        href: '/admin/manufacturing/routing_manage',
        permission: PERMISSIONS.manufacturing.orders.view,
        module: 'manufacturing',
        legacy: true,
      },
      {
        id: 'manufacturing_q_a',
        labelKey: 'shell.mrp_work_centers',
        icon: 'question-circle',
        href: '/admin/manufacturing/work_center_manage',
        permission: PERMISSIONS.manufacturing.orders.view,
        module: 'manufacturing',
        legacy: true,
      },
      {
        id: 'manufacturing_contract',
        labelKey: 'shell.mrp_manufaturing_orders',
        icon: 'first-order',
        href: '/admin/manufacturing/manufacturing_order_manage',
        permission: PERMISSIONS.manufacturing.orders.view,
        module: 'manufacturing',
        legacy: true,
      },
      {
        id: 'manufacturing_dependent_person',
        labelKey: 'shell.mrp_work_orders',
        icon: 'address-card',
        href: '/admin/manufacturing/work_order_manage',
        permission: PERMISSIONS.manufacturing.orders.view,
        module: 'manufacturing',
        legacy: true,
      },
      {
        id: 'manufacturing_setting',
        labelKey: 'shell.mrp_settings',
        icon: 'cog',
        href: '/admin/manufacturing/setting?group=working_hour',
        permission: PERMISSIONS.manufacturing.orders.view,
        module: 'manufacturing',
        legacy: true,
      },
    ],
  },
  {
    id: 'quality',
    labelKey: 'shell.quality_quality_label',
    icon: 'medal',
    module: 'quality',
    children: [
      {
        id: 'quality_dashboard',
        labelKey: 'shell.quality_dashboard',
        icon: 'dashboard',
        href: '/admin/quality/dashboard',
        permission: PERMISSIONS.quality.dashboard.view,
        module: 'quality',
        legacy: true,
      },
      {
        id: 'quality_control_point',
        labelKey: 'shell.quality_control_point_menu',
        icon: 'arrows-to-dot',
        href: '/admin/quality/control_points',
        permission: PERMISSIONS.quality.controlPoint.view,
        module: 'quality',
        legacy: true,
      },
      {
        id: 'quality_quality_check',
        labelKey: 'shell.quality_quality_check_menu',
        icon: 'list-check',
        href: '/admin/quality/quality_checks',
        permission: [PERMISSIONS.quality.check.view, PERMISSIONS.quality.check.viewOwn],
        module: 'quality',
        legacy: true,
      },
      {
        id: 'quality_quality_alert',
        labelKey: 'shell.quality_quality_alert_menu',
        icon: 'circle-exclamation',
        href: '/admin/quality/quality_alerts',
        permission: [PERMISSIONS.quality.alert.view, PERMISSIONS.quality.alert.viewOwn],
        module: 'quality',
        legacy: true,
      },
      {
        id: 'quality_failure_location',
        labelKey: 'shell.quality_failure_location_menu',
        icon: 'circle-xmark',
        href: '/admin/quality/failure_locations',
        permission: PERMISSIONS.quality.failureLocation.view,
        module: 'quality',
        legacy: true,
      },
      {
        id: 'quality_setting',
        labelKey: 'shell.quality_settings',
        icon: 'cog',
        href: '/admin/quality/setting?group=teams',
        permission: PERMISSIONS.quality.settings.view,
        module: 'quality',
        legacy: true,
      },
    ],
  },
  {
    id: 'sales',
    labelKey: 'shell.als_sales',
    icon: 'bolt',
    module: 'sales',
    children: [
      {
        id: 'proposals',
        labelKey: 'shell.proposals',
        href: '/admin/proposals',
        permission: [PERMISSIONS.sales.proposals.view, PERMISSIONS.sales.proposals.viewOwn],
        module: 'sales',
        legacy: true,
      },
      {
        id: 'estimates',
        labelKey: 'shell.estimates',
        href: '/admin/estimates',
        permission: [PERMISSIONS.sales.estimates.view, PERMISSIONS.sales.estimates.viewOwn],
        module: 'sales',
        legacy: true,
      },
      {
        id: 'invoices',
        labelKey: 'shell.invoices',
        href: '/admin/invoices',
        permission: [PERMISSIONS.sales.invoices.view, PERMISSIONS.sales.invoices.viewOwn],
        module: 'sales',
        legacy: true,
      },
      // Perfex reads `view payments` OR `view_own invoices` here, plus an assigned-invoices option; kept as that pair
      {
        id: 'payments',
        labelKey: 'shell.payments',
        href: '/admin/payments',
        permission: [PERMISSIONS.sales.payments.view, PERMISSIONS.sales.invoices.viewOwn],
        module: 'sales',
        legacy: true,
      },
      {
        id: 'credit_notes',
        labelKey: 'shell.credit_notes',
        href: '/admin/credit_notes',
        permission: [PERMISSIONS.sales.creditNotes.view, PERMISSIONS.sales.creditNotes.viewOwn],
        module: 'sales',
        legacy: true,
      },
      // ungated in Perfex (the call sits outside the credit-notes `if`); its label is a literal there, so the key is ours
      {
        id: 'sales_returns',
        labelKey: 'shell.sales_returns',
        href: '/admin/sales_returns',
        module: 'sales',
        legacy: true,
      },
      {
        id: 'items',
        labelKey: 'shell.items',
        href: '/admin/invoice_items',
        permission: PERMISSIONS.sales.items.view,
        module: 'sales',
        legacy: true,
      },
    ],
  },
  {
    id: 'subscriptions',
    labelKey: 'shell.subscriptions',
    icon: 'repeat',
    href: '/admin/subscriptions',
    permission: [PERMISSIONS.sales.subscriptions.view, PERMISSIONS.sales.subscriptions.viewOwn],
    module: 'sales',
    legacy: true,
  },
  {
    id: 'expenses',
    labelKey: 'shell.expenses',
    icon: 'file-lines',
    href: '/admin/expenses',
    permission: [PERMISSIONS.sales.expenses.view, PERMISSIONS.sales.expenses.viewOwn],
    module: 'sales',
    legacy: true,
  },
  {
    id: 'contracts',
    labelKey: 'shell.contracts',
    icon: 'note-sticky',
    href: '/admin/contracts',
    permission: [PERMISSIONS.sales.contracts.view, PERMISSIONS.sales.contracts.viewOwn],
    module: 'sales',
    legacy: true,
  },
  {
    id: 'fixed_equipment',
    labelKey: 'shell.fe_fixed_equipment',
    icon: 'bullseye',
    module: 'fixedEquipment',
    children: [
      {
        id: 'fixed_equipment_dashboard',
        labelKey: 'shell.fe_dashboard',
        icon: 'dashboard',
        href: '/admin/fixed_equipment/dashboard',
        permission: [
          PERMISSIONS.fixedEquipment.dashboard.view,
          PERMISSIONS.fixedEquipment.dashboard.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_assets',
        labelKey: 'shell.fe_assets',
        icon: 'bath',
        href: '/admin/fixed_equipment/assets',
        permission: [
          PERMISSIONS.fixedEquipment.assets.view,
          PERMISSIONS.fixedEquipment.assets.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_asset_request_form',
        labelKey: 'shell.fe_asset_request_form',
        icon: 'file-text-o',
        href: '/admin/fixed_equipment/asset_request_forms',
        permission: [
          PERMISSIONS.fixedEquipment.assetRequestForm.view,
          PERMISSIONS.fixedEquipment.assetRequestForm.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_licenses',
        labelKey: 'shell.fe_licenses',
        icon: 'certificate',
        href: '/admin/fixed_equipment/licenses',
        permission: [
          PERMISSIONS.fixedEquipment.licenses.view,
          PERMISSIONS.fixedEquipment.licenses.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_accessories',
        labelKey: 'shell.fe_accessories',
        icon: 'check',
        href: '/admin/fixed_equipment/accessories',
        permission: [
          PERMISSIONS.fixedEquipment.accessories.view,
          PERMISSIONS.fixedEquipment.accessories.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_asset_creation',
        labelKey: 'shell.fe_asset_creation',
        icon: 'plus-circle',
        href: '/admin/fixed_equipment/asset_creation',
        permission: [
          PERMISSIONS.fixedEquipment.assetCreation.view,
          PERMISSIONS.fixedEquipment.assetCreation.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_asset_purchase',
        labelKey: 'shell.fe_asset_purchase_request',
        icon: 'shopping-cart',
        href: '/admin/purchase/pur_request?type=AS',
        permission: [
          PERMISSIONS.fixedEquipment.assets.view,
          PERMISSIONS.fixedEquipment.assets.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_asset_inventory',
        labelKey: 'shell.fe_asset_inventory',
        icon: 'boxes-stacked',
        href: '/admin/fixed_equipment/asset_inventory',
        permission: [
          PERMISSIONS.fixedEquipment.assets.view,
          PERMISSIONS.fixedEquipment.assets.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_consumables',
        labelKey: 'shell.fe_consumables',
        icon: 'life-ring',
        href: '/admin/fixed_equipment/consumables',
        permission: [
          PERMISSIONS.fixedEquipment.consumables.view,
          PERMISSIONS.fixedEquipment.consumables.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_components',
        labelKey: 'shell.fe_components',
        icon: 'recycle',
        href: '/admin/fixed_equipment/components',
        permission: [
          PERMISSIONS.fixedEquipment.components.view,
          PERMISSIONS.fixedEquipment.components.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_predefined_kits',
        labelKey: 'shell.fe_predefined_kits',
        icon: 'object-group',
        href: '/admin/fixed_equipment/predefined_kits',
        permission: [
          PERMISSIONS.fixedEquipment.predefinedKits.view,
          PERMISSIONS.fixedEquipment.predefinedKits.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_checkout_mgt',
        labelKey: 'shell.fe_sign_manager',
        icon: 'handshake',
        href: '/admin/fixed_equipment/checkout_managements',
        permission: [
          PERMISSIONS.fixedEquipment.signManager.view,
          PERMISSIONS.fixedEquipment.signManager.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_requested',
        labelKey: 'shell.fe_requested',
        icon: 'undo',
        href: '/admin/fixed_equipment/requested',
        permission: [
          PERMISSIONS.fixedEquipment.requested.view,
          PERMISSIONS.fixedEquipment.requested.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_assets_maintenances',
        labelKey: 'shell.fe_maintenances',
        icon: 'wrench',
        href: '/admin/fixed_equipment/assets_maintenances',
        permission: [
          PERMISSIONS.fixedEquipment.maintenances.view,
          PERMISSIONS.fixedEquipment.maintenances.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_bulk_audit',
        labelKey: 'shell.fe_audit',
        icon: 'file',
        href: '/admin/fixed_equipment/audit_managements',
        permission: [
          PERMISSIONS.fixedEquipment.audit.view,
          PERMISSIONS.fixedEquipment.audit.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_depreciations',
        labelKey: 'shell.fe_depreciations',
        icon: 'usd',
        href: '/admin/fixed_equipment/depreciations',
        permission: [
          PERMISSIONS.fixedEquipment.depreciations.view,
          PERMISSIONS.fixedEquipment.depreciations.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_delivery_note',
        labelKey: 'shell.fe_delivery_note',
        icon: 'pencil-square',
        href: '/admin/fixed_equipment/delivery_note',
        permission: [
          PERMISSIONS.fixedEquipment.inventory.view,
          PERMISSIONS.fixedEquipment.inventory.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_internal_transfer',
        labelKey: 'shell.fe_internal_transfer',
        icon: 'reply-all',
        href: '/admin/fixed_equipment/internal_transfer',
        permission: [
          PERMISSIONS.fixedEquipment.inventory.view,
          PERMISSIONS.fixedEquipment.inventory.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_inventory',
        labelKey: 'shell.fe_inventory',
        icon: 'indent',
        href: '/admin/fixed_equipment/inventory?tab=inventory_receiving',
        permission: [
          PERMISSIONS.fixedEquipment.inventory.view,
          PERMISSIONS.fixedEquipment.inventory.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_inventory_delivery',
        labelKey: 'shell.fe_inventory_delivery',
        icon: 'outdent',
        href: '/admin/fixed_equipment/inventory_delivery',
        permission: [
          PERMISSIONS.fixedEquipment.inventory.view,
          PERMISSIONS.fixedEquipment.inventory.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_inventory_history',
        labelKey: 'shell.fe_inventory_history',
        icon: 'clock-o',
        href: '/admin/fixed_equipment/inventory_history',
        permission: [
          PERMISSIONS.fixedEquipment.inventory.view,
          PERMISSIONS.fixedEquipment.inventory.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_inventory_receiving',
        labelKey: 'shell.fe_inventory_receiving',
        icon: 'indent',
        href: '/admin/fixed_equipment/inventory_receiving',
        permission: [
          PERMISSIONS.fixedEquipment.inventory.view,
          PERMISSIONS.fixedEquipment.inventory.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_locations',
        labelKey: 'shell.fe_locations',
        icon: 'map',
        href: '/admin/fixed_equipment/locations',
        permission: [
          PERMISSIONS.fixedEquipment.locations.view,
          PERMISSIONS.fixedEquipment.locations.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_packing_list',
        labelKey: 'shell.fe_packing_list',
        icon: 'inbox',
        href: '/admin/fixed_equipment/packing_list',
        permission: [
          PERMISSIONS.fixedEquipment.inventory.view,
          PERMISSIONS.fixedEquipment.inventory.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_shipments',
        labelKey: 'shell.fe_shipments',
        icon: 'truck',
        href: '/admin/fixed_equipment/shipments',
        permission: [
          PERMISSIONS.fixedEquipment.inventory.view,
          PERMISSIONS.fixedEquipment.inventory.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_order_list',
        labelKey: 'shell.fe_order_list',
        icon: 'list',
        href: '/admin/fixed_equipment/order_list',
        permission: [
          PERMISSIONS.fixedEquipment.orderList.view,
          PERMISSIONS.fixedEquipment.orderList.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      {
        id: 'fixed_equipment_report',
        labelKey: 'shell.fe_report',
        icon: 'area-chart',
        href: '/admin/fixed_equipment/report',
        permission: [
          PERMISSIONS.fixedEquipment.reports.view,
          PERMISSIONS.fixedEquipment.reports.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
      // Perfex shows it only when the `fe_show_public_page` option is on — an option, not a permission, so it is declared unconditionally here
      {
        id: 'fixed_equipment_portal',
        labelKey: 'shell.fe_portal',
        icon: 'bookmark',
        href: '/fixed_equipment/fixed_equipment_client/index/1/0/0',
        module: 'fixedEquipment',
        legacy: true,
      },
      // ungated in Perfex; the closest clean gate is the settings-category pair the screen itself needs
      {
        id: 'fixed_equipment_settings',
        labelKey: 'shell.fe_settings',
        icon: 'cogs',
        href: '/admin/fixed_equipment/settings',
        permission: [
          PERMISSIONS.fixedEquipment.settingCategory.view,
          PERMISSIONS.fixedEquipment.settingCategory.viewOwn,
        ],
        module: 'fixedEquipment',
        legacy: true,
      },
    ],
  },
  {
    id: 'hr_payroll',
    labelKey: 'shell.hr_payroll',
    icon: 'users',
    module: 'payroll',
    children: [
      {
        id: 'hr_manage_employees',
        labelKey: 'shell.hr_manage_employees',
        icon: 'vcard',
        href: '/admin/hr_payroll/manage_employees',
        permission: [PERMISSIONS.payroll.employee.view, PERMISSIONS.payroll.employee.viewOwn],
        module: 'payroll',
        legacy: true,
      },
      {
        id: 'hr_manage_attendance',
        labelKey: 'shell.hr_manage_attendance',
        icon: 'pen-to-square',
        href: '/admin/hr_payroll/manage_attendance',
        permission: [PERMISSIONS.payroll.attendance.view, PERMISSIONS.payroll.attendance.viewOwn],
        module: 'payroll',
        legacy: true,
      },
      {
        id: 'hr_manage_commissions',
        labelKey: 'shell.hrp_commission_manage',
        icon: 'american-sign-language-interpreting',
        href: '/admin/hr_payroll/manage_commissions',
        permission: [PERMISSIONS.payroll.commission.view, PERMISSIONS.payroll.commission.viewOwn],
        module: 'payroll',
        legacy: true,
      },
      {
        id: 'hr_manage_deductions',
        labelKey: 'shell.hrp_deduction_manage',
        icon: 'cut',
        href: '/admin/hr_payroll/manage_deductions',
        permission: [PERMISSIONS.payroll.deduction.view, PERMISSIONS.payroll.deduction.viewOwn],
        module: 'payroll',
        legacy: true,
      },
      {
        id: 'hr_bonus_kpi',
        labelKey: 'shell.hr_bonus_kpi',
        icon: 'gift',
        href: '/admin/hr_payroll/manage_bonus',
        permission: [PERMISSIONS.payroll.bonusKpi.view, PERMISSIONS.payroll.bonusKpi.viewOwn],
        module: 'payroll',
        legacy: true,
      },
      {
        id: 'hrp_insurrance',
        labelKey: 'shell.hrp_insurrance',
        icon: 'medkit',
        href: '/admin/hr_payroll/manage_insurances',
        permission: [PERMISSIONS.payroll.insurance.view, PERMISSIONS.payroll.insurance.viewOwn],
        module: 'payroll',
        legacy: true,
      },
      {
        id: 'hr_pay_slips',
        labelKey: 'shell.hr_pay_slips',
        icon: 'money-bill',
        href: '/admin/hr_payroll/payslip_manage',
        permission: [PERMISSIONS.payroll.payslip.view, PERMISSIONS.payroll.payslip.viewOwn],
        module: 'payroll',
        legacy: true,
      },
      {
        id: 'hrp_payslip_template',
        labelKey: 'shell.hr_pay_slip_templates',
        icon: 'outdent',
        href: '/admin/hr_payroll/payslip_templates_manage',
        permission: [
          PERMISSIONS.payroll.payslipTemplate.view,
          PERMISSIONS.payroll.payslipTemplate.viewOwn,
        ],
        module: 'payroll',
        legacy: true,
      },
      {
        id: 'hrp_income_tax',
        labelKey: 'shell.hrp_income_tax',
        icon: 'calendar-minus',
        href: '/admin/hr_payroll/income_taxs_manage',
        permission: [PERMISSIONS.payroll.incomeTax.view, PERMISSIONS.payroll.incomeTax.viewOwn],
        module: 'payroll',
        legacy: true,
      },
      {
        id: 'hr_payroll_reports',
        labelKey: 'shell.hrp_reports',
        icon: 'list-alt',
        href: '/admin/hr_payroll/reports',
        permission: PERMISSIONS.payroll.reports.view,
        module: 'payroll',
        legacy: true,
      },
      {
        id: 'hrp_settings',
        labelKey: 'shell.settings',
        icon: 'cog',
        href: '/admin/hr_payroll/setting?group=income_tax_rates',
        permission: PERMISSIONS.payroll.settings.view,
        module: 'payroll',
        legacy: true,
      },
    ],
  },
  // ungated in Perfex, so it carries no permission here either
  {
    id: 'projects',
    labelKey: 'shell.projects',
    icon: 'chart-gantt',
    href: '/admin/projects',
    module: 'projects',
    legacy: true,
  },
  // Perfex gates the last three on is_admin() OR a purchase_settings capability; ADR-0034 d.2 keeps the admin half implicit (admins bypass), and `purchase.settings` has only `edit` in the catalogue
  {
    id: 'purchase',
    labelKey: 'shell.purchase',
    icon: 'shopping-cart',
    module: 'purchase',
    children: [
      {
        id: 'purchase-items',
        labelKey: 'shell.items',
        icon: 'clone',
        href: '/admin/purchase/items',
        permission: PERMISSIONS.purchase.items.view,
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'vendors',
        labelKey: 'shell.vendor',
        icon: 'users',
        href: '/admin/purchase/vendors',
        permission: [PERMISSIONS.purchase.vendors.view, PERMISSIONS.purchase.vendors.viewOwn],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'vendors-items',
        labelKey: 'shell.vendor_item',
        icon: 'newspaper',
        href: '/admin/purchase/vendor_items',
        permission: [
          PERMISSIONS.purchase.vendorItems.view,
          PERMISSIONS.purchase.vendorItems.viewOwn,
        ],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase-request',
        labelKey: 'shell.purchase_request',
        icon: 'shopping-basket',
        href: '/admin/purchase/purchase_request',
        permission: [PERMISSIONS.purchase.request.view, PERMISSIONS.purchase.request.viewOwn],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase-quotation',
        labelKey: 'shell.quotations',
        icon: 'file-powerpoint',
        href: '/admin/purchase/quotations',
        permission: [PERMISSIONS.purchase.quotations.view, PERMISSIONS.purchase.quotations.viewOwn],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase-order',
        labelKey: 'shell.purchase_order',
        icon: 'cart-plus',
        href: '/admin/purchase/purchase_order',
        permission: [PERMISSIONS.purchase.orders.view, PERMISSIONS.purchase.orders.viewOwn],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase-faf',
        labelKey: 'shell.pur_faf_requests',
        icon: 'list',
        href: '/admin/purchase/faf_requests',
        permission: [PERMISSIONS.purchase.faf.view, PERMISSIONS.purchase.faf.viewOwn],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase-bid-waiver',
        labelKey: 'shell.pur_bid_waivers',
        icon: 'gavel',
        href: '/admin/purchase/bid_waivers',
        permission: [PERMISSIONS.purchase.bidWaiver.view, PERMISSIONS.purchase.bidWaiver.viewOwn],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'return-order',
        labelKey: 'shell.pur_return_orders',
        icon: 'reply-all',
        href: '/admin/purchase/order_returns',
        permission: [
          PERMISSIONS.purchase.orderReturn.view,
          PERMISSIONS.purchase.orderReturn.viewOwn,
        ],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase-contract',
        labelKey: 'shell.contracts',
        icon: 'file-text',
        href: '/admin/purchase/contracts',
        permission: [PERMISSIONS.purchase.contracts.view, PERMISSIONS.purchase.contracts.viewOwn],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase-petty-cash',
        labelKey: 'shell.pur_petty_cash_advances',
        icon: 'money',
        href: '/admin/purchase/petty_cash_advances',
        permission: [PERMISSIONS.purchase.pettyCash.view, PERMISSIONS.purchase.pettyCash.viewOwn],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase-debit-note',
        labelKey: 'shell.pur_debit_note',
        icon: 'credit-card',
        href: '/admin/purchase/debit_notes',
        permission: [PERMISSIONS.purchase.debitNotes.view, PERMISSIONS.purchase.debitNotes.viewOwn],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase-invoices',
        labelKey: 'shell.invoices',
        icon: 'clipboard',
        href: '/admin/purchase/invoices',
        permission: [PERMISSIONS.purchase.invoices.view, PERMISSIONS.purchase.invoices.viewOwn],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'inventory-shipping-charges',
        labelKey: 'shell.inventory_shipping_charges',
        icon: 'truck',
        href: '/admin/purchase/shipping_charges',
        permission: [PERMISSIONS.purchase.invoices.view, PERMISSIONS.purchase.invoices.viewOwn],
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase_reports',
        labelKey: 'shell.reports',
        icon: 'bar-chart',
        href: '/admin/purchase/reports',
        permission: PERMISSIONS.purchase.reports.view,
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase-settings',
        labelKey: 'shell.setting',
        icon: 'gears',
        href: '/admin/purchase/setting',
        permission: PERMISSIONS.purchase.settings.edit,
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase-terms',
        labelKey: 'shell.pur_terms',
        icon: 'file-contract',
        href: '/admin/purchase/terms',
        permission: PERMISSIONS.purchase.settings.edit,
        module: 'purchase',
        legacy: true,
      },
      {
        id: 'purchase-request-types',
        labelKey: 'shell.request_types',
        icon: 'tags',
        href: '/admin/purchase/request_types',
        permission: PERMISSIONS.purchase.settings.edit,
        module: 'purchase',
        legacy: true,
      },
    ],
  },
  {
    id: 'timesheets',
    labelKey: 'shell.timesheets_and_leave',
    icon: 'user-circle',
    module: 'timesheets',
    children: [
      {
        id: 'timesheets_timekeeping',
        labelKey: 'shell.attendance',
        icon: 'pen-to-square',
        href: '/admin/timesheets/timekeeping',
        permission: [
          PERMISSIONS.timesheets.attendance.view,
          PERMISSIONS.timesheets.attendance.viewOwn,
        ],
        module: 'timesheets',
        legacy: true,
      },
      {
        id: 'timesheets_timekeeping_mnrh',
        labelKey: 'shell.leave',
        icon: 'clipboard',
        href: '/admin/timesheets/requisition_manage',
        permission: [PERMISSIONS.timesheets.leave.view, PERMISSIONS.timesheets.leave.viewOwn],
        module: 'timesheets',
        legacy: true,
      },
      {
        id: 'timesheets_route_management',
        labelKey: 'shell.route_management',
        icon: 'map-signs',
        href: '/admin/timesheets/route_management?tab=route',
        permission: [PERMISSIONS.timesheets.routes.view, PERMISSIONS.timesheets.routes.viewOwn],
        module: 'timesheets',
        legacy: true,
      },
      {
        id: 'timesheets_shift_management',
        labelKey: 'shell.shift_management',
        icon: 'calendar',
        href: '/admin/timesheets/shift_management',
        permission: [
          PERMISSIONS.timesheets.shiftwork.view,
          PERMISSIONS.timesheets.shiftwork.viewOwn,
        ],
        module: 'timesheets',
        legacy: true,
      },
      {
        id: 'timesheets_table_shiftwork',
        labelKey: 'shell.shiftwork',
        icon: 'ticket',
        href: '/admin/timesheets/table_shiftwork',
        permission: [
          PERMISSIONS.timesheets.shiftwork.view,
          PERMISSIONS.timesheets.shiftwork.viewOwn,
        ],
        module: 'timesheets',
        legacy: true,
      },
      {
        id: 'timesheets_shift_type',
        labelKey: 'shell.shift_type',
        icon: 'magic',
        href: '/admin/timesheets/manage_shift_type',
        permission: [
          PERMISSIONS.timesheets.shiftwork.view,
          PERMISSIONS.timesheets.shiftwork.viewOwn,
        ],
        module: 'timesheets',
        legacy: true,
      },
      {
        id: 'timesheets_workplace_mgt',
        labelKey: 'shell.workplace_mgt',
        icon: 'street-view',
        href: '/admin/timesheets/workplace_mgt?group=workplace_assign',
        permission: [
          PERMISSIONS.timesheets.workplaces.view,
          PERMISSIONS.timesheets.workplaces.viewOwn,
        ],
        module: 'timesheets',
        legacy: true,
      },
      {
        id: 'timesheets-report',
        labelKey: 'shell.reports',
        icon: 'line-chart',
        href: '/admin/timesheets/reports',
        permission: [PERMISSIONS.timesheets.reports.view, PERMISSIONS.timesheets.reports.viewOwn],
        module: 'timesheets',
        legacy: true,
      },
      {
        id: 'timesheets_setting',
        labelKey: 'shell.settings',
        icon: 'gears',
        href: '/admin/timesheets/setting?group=manage_leave',
        permission: PERMISSIONS.timesheets.settings.view,
        module: 'timesheets',
        legacy: true,
      },
    ],
  },
  // Perfex also registers one child per warehouse row (`wa_manage_warehouse_<id>`); those are data, not declared items
  {
    id: 'warehouse',
    labelKey: 'shell.warehouse',
    icon: 'snowflake',
    module: 'warehouse',
    children: [
      {
        id: 'wa_commodity_list',
        labelKey: 'shell.items',
        icon: 'clone',
        href: '/admin/warehouse/commodity_list',
        permission: PERMISSIONS.warehouse.items.view,
        module: 'warehouse',
        legacy: true,
      },
      {
        id: 'wa_manage_inventory',
        labelKey: 'shell.wh_inventory',
        icon: 'boxes-stacked',
        href: '/admin/warehouse/inventory',
        permission: PERMISSIONS.warehouse.items.view,
        module: 'warehouse',
        legacy: true,
      },
      {
        id: 'wa_manage_goods_receipt',
        labelKey: 'shell.stock_import',
        icon: 'object-group',
        href: '/admin/warehouse/manage_purchase',
        permission: [
          PERMISSIONS.warehouse.stockImport.view,
          PERMISSIONS.warehouse.stockImport.viewOwn,
        ],
        module: 'warehouse',
        legacy: true,
      },
      {
        id: 'wa_manage_goods_delivery',
        labelKey: 'shell.stock_export',
        icon: 'object-ungroup',
        href: '/admin/warehouse/manage_delivery',
        permission: [
          PERMISSIONS.warehouse.stockExport.view,
          PERMISSIONS.warehouse.stockExport.viewOwn,
        ],
        module: 'warehouse',
        legacy: true,
      },
      {
        id: 'wa_manage_packing_list',
        labelKey: 'shell.wh_packing_lists',
        icon: 'inbox',
        href: '/admin/warehouse/manage_packing_list',
        permission: [
          PERMISSIONS.warehouse.packingList.view,
          PERMISSIONS.warehouse.packingList.viewOwn,
        ],
        module: 'warehouse',
        legacy: true,
      },
      {
        id: 'wa_manage_internal_delivery',
        labelKey: 'shell.internal_delivery_note',
        icon: 'rss-square',
        href: '/admin/warehouse/manage_internal_delivery',
        permission: [
          PERMISSIONS.warehouse.internalDeliveryNote.view,
          PERMISSIONS.warehouse.internalDeliveryNote.viewOwn,
        ],
        module: 'warehouse',
        legacy: true,
      },
      {
        id: 'wa_manage_loss_adjustment',
        labelKey: 'shell.loss_adjustment',
        icon: 'adjust',
        href: '/admin/warehouse/loss_adjustment',
        permission: [
          PERMISSIONS.warehouse.lossAdjustment.view,
          PERMISSIONS.warehouse.lossAdjustment.viewOwn,
        ],
        module: 'warehouse',
        legacy: true,
      },
      {
        id: 'wa_manage_order_return',
        labelKey: 'shell.inventory_receipt_inventory_delivery_returns_goods',
        icon: 'reply-all',
        href: '/admin/warehouse/manage_order_return',
        permission: [
          PERMISSIONS.warehouse.receiptReturnOrder.view,
          PERMISSIONS.warehouse.receiptReturnOrder.viewOwn,
        ],
        module: 'warehouse',
        legacy: true,
      },
      {
        id: 'wa_manage_warehouse',
        labelKey: 'shell._warehouse',
        icon: 'home',
        href: '/admin/warehouse/warehouse_mange',
        permission: [
          PERMISSIONS.warehouse.warehouses.view,
          PERMISSIONS.warehouse.warehouses.assign,
        ],
        module: 'warehouse',
        legacy: true,
      },
      {
        id: 'wa_report',
        labelKey: 'shell.report',
        icon: 'area-chart',
        href: '/admin/warehouse/manage_report',
        permission: PERMISSIONS.warehouse.reports.view,
        module: 'warehouse',
        legacy: true,
      },
      {
        id: 'wa_warehouse_history',
        labelKey: 'shell.warehouse_history',
        icon: 'calendar',
        href: '/admin/warehouse/warehouse_history',
        permission: PERMISSIONS.warehouse.history.view,
        module: 'warehouse',
        legacy: true,
      },
      {
        id: 'ware_settings',
        labelKey: 'shell.settings',
        icon: 'gears',
        href: '/admin/warehouse/setting',
        permission: PERMISSIONS.warehouse.settings.view,
        module: 'warehouse',
        legacy: true,
      },
    ],
  },
  // Node's since W2A-03: still a Main Menu item at Perfex's position 31 (D-25), its page under
  // /setup (D-05), its gate read from ROUTE_GATES.
  {
    id: 'cost-centers',
    labelKey: 'shell.cost_centers',
    icon: 'sitemap',
    href: '/setup/cost-centers',
    ...navGateOf('/setup/cost-centers'),
    module: 'cost-centers',
  },
  {
    id: 'tasks',
    labelKey: 'shell.als_tasks',
    icon: 'circle-check',
    href: '/admin/tasks',
    permission: [
      PERMISSIONS.projects.tasks.view,
      PERMISSIONS.projects.tasks.viewOwn,
      PERMISSIONS.projects.tasks.create,
    ],
    module: 'projects',
    legacy: true,
  },
  // Perfex adds a staff-member / ticket-option branch, and registers one child per ticket status at runtime — data, not a declared item
  // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
  {
    id: 'support',
    labelKey: 'shell.support',
    icon: 'life-ring',
    href: '/admin/tickets',
    adminOnly: true,
    legacy: true,
  },
  // Perfex wraps this in is_admin() AND is_staff_member()
  // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
  {
    id: 'leads',
    labelKey: 'shell.als_leads',
    icon: 'crosshairs',
    href: '/admin/leads',
    adminOnly: true,
    module: 'crm',
    legacy: true,
  },
  {
    id: 'estimate_request',
    labelKey: 'shell.estimate_request',
    icon: 'file',
    href: '/admin/estimate_request',
    permission: [PERMISSIONS.sales.estimateRequest.view, PERMISSIONS.sales.estimateRequest.viewOwn],
    module: 'sales',
    legacy: true,
  },
  {
    id: 'knowledge-base',
    labelKey: 'shell.als_kb',
    icon: 'question-circle',
    href: '/admin/knowledge_base',
    permission: PERMISSIONS.knowledgeBase.articles.view,
    module: 'knowledgeBase',
    legacy: true,
  },
  // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
  {
    id: 'utilities',
    labelKey: 'shell.als_utilities',
    icon: 'circle-dot',
    adminOnly: true,
    module: 'utilities',
    children: [
      // ungated in Perfex: the call sits outside the is_admin block that registers the parent
      {
        id: 'media',
        labelKey: 'shell.als_media',
        href: '/admin/utilities/media',
        legacy: true,
      },
      {
        id: 'bulk-pdf-exporter',
        labelKey: 'shell.bulk_pdf_exporter',
        href: '/admin/utilities/bulk_pdf_exporter',
        permission: PERMISSIONS.utilities.bulkPdfExporter.view,
        module: 'utilities',
        legacy: true,
      },
      // ungated in Perfex
      {
        id: 'calendar',
        labelKey: 'shell.als_calendar_submenu',
        href: '/admin/utilities/calendar',
        legacy: true,
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'announcements',
        labelKey: 'shell.als_announcements_submenu',
        href: '/admin/announcements',
        adminOnly: true,
        legacy: true,
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'activity-log',
        labelKey: 'shell.als_activity_log_submenu',
        href: '/admin/utilities/activity_log',
        adminOnly: true,
        legacy: true,
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'ticket-pipe-log',
        labelKey: 'shell.ticket_pipe_log',
        href: '/admin/utilities/pipe_log',
        adminOnly: true,
        legacy: true,
      },
    ],
  },
  // its label is a literal in Perfex, so the key is ours
  // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
  {
    id: 'face-attendance',
    labelKey: 'shell.face_attendance',
    icon: 'user-circle',
    href: '/admin/face_registration',
    adminOnly: true,
    legacy: true,
  },
  {
    id: 'reports',
    labelKey: 'shell.als_reports',
    icon: 'chart-line',
    href: '/admin/reports',
    permission: [PERMISSIONS.reports.general.view, PERMISSIONS.reports.timesheets.view],
    module: 'reports',
    legacy: true,
    children: [
      {
        id: 'sales-reports',
        labelKey: 'shell.als_reports_sales_submenu',
        href: '/admin/reports/sales',
        permission: PERMISSIONS.reports.general.view,
        module: 'reports',
        legacy: true,
      },
      {
        id: 'expenses-reports',
        labelKey: 'shell.als_reports_expenses',
        href: '/admin/reports/expenses',
        permission: PERMISSIONS.reports.general.view,
        module: 'reports',
        legacy: true,
      },
      {
        id: 'expenses-vs-income-reports',
        labelKey: 'shell.als_expenses_vs_income',
        href: '/admin/reports/expenses_vs_income',
        permission: PERMISSIONS.reports.general.view,
        module: 'reports',
        legacy: true,
      },
      {
        id: 'leads-reports',
        labelKey: 'shell.als_reports_leads_submenu',
        href: '/admin/reports/leads',
        permission: PERMISSIONS.reports.general.view,
        module: 'reports',
        legacy: true,
      },
      {
        id: 'timesheets-reports',
        labelKey: 'shell.timesheets_overview',
        href: '/admin/staff/timesheets?view=all',
        permission: PERMISSIONS.reports.timesheets.view,
        module: 'reports',
        legacy: true,
      },
      {
        id: 'knowledge-base-reports',
        labelKey: 'shell.als_kb_articles_submenu',
        href: '/admin/reports/knowledge_base_articles',
        permission: PERMISSIONS.reports.general.view,
        module: 'reports',
        legacy: true,
      },
    ],
  },
];

/**
 * Perfex's second panel (`setup_menu.php`), kept as its own panel rather than flattened into the
 * sidebar (UI-SPEC). Setup -> Staff, Setup -> Finance -> Taxes, Setup -> Finance -> Expenses
 * Categories and Setup -> Roles are the four entries that point at Node.
 */
export const SETUP_NAVIGATION: readonly NavItem[] = [
  // The gate comes from ROUTE_GATES (`navGateOf`), never from a second declaration here.
  {
    id: 'staff',
    labelKey: 'shell.als_staff',
    href: '/setup/staff',
    ...navGateOf('/setup/staff'),
    module: 'staff',
  },
  // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
  {
    id: 'customers',
    labelKey: 'shell.clients',
    adminOnly: true,
    module: 'crm',
    children: [
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'customer-groups',
        labelKey: 'shell.customer_groups',
        href: '/setup/customer-groups',
        ...navGateOf('/setup/customer-groups'),
        module: 'crm',
      },
    ],
  },
  // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
  {
    id: 'support',
    labelKey: 'shell.support',
    adminOnly: true,
    children: [
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'departments',
        labelKey: 'shell.acs_departments',
        href: '/admin/departments',
        adminOnly: true,
        legacy: true,
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'tickets-predefined-replies',
        labelKey: 'shell.acs_ticket_predefined_replies_submenu',
        href: '/admin/tickets/predefined_replies',
        adminOnly: true,
        legacy: true,
      },
      {
        id: 'tickets-priorities',
        labelKey: 'shell.ticket_priorities',
        href: '/setup/ticket-priorities',
        ...navGateOf('/setup/ticket-priorities'),
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'tickets-statuses',
        labelKey: 'shell.acs_ticket_statuses_submenu',
        href: '/setup/ticket-statuses',
        ...navGateOf('/setup/ticket-statuses'),
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'tickets-services',
        labelKey: 'shell.acs_ticket_services_submenu',
        href: '/setup/services',
        ...navGateOf('/setup/services'),
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'tickets-spam-filters',
        labelKey: 'shell.spam_filters',
        href: '/admin/spam_filters/view/tickets',
        adminOnly: true,
        legacy: true,
      },
    ],
  },
  // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
  {
    id: 'leads',
    labelKey: 'shell.acs_leads',
    adminOnly: true,
    module: 'crm',
    children: [
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'leads-sources',
        labelKey: 'shell.acs_leads_sources_submenu',
        href: '/setup/lead-sources',

        module: 'crm',
        ...navGateOf('/setup/lead-sources'),
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'leads-statuses',
        labelKey: 'shell.acs_leads_statuses_submenu',
        href: '/admin/leads/statuses',
        adminOnly: true,
        module: 'crm',
        legacy: true,
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'leads-email-integration',
        labelKey: 'shell.leads_email_integration',
        href: '/admin/leads/email_integration',
        adminOnly: true,
        module: 'crm',
        legacy: true,
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'web-to-lead',
        labelKey: 'shell.web_to_lead',
        href: '/admin/leads/forms',
        adminOnly: true,
        module: 'crm',
        legacy: true,
      },
    ],
  },
  // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
  {
    id: 'finance',
    labelKey: 'shell.acs_finance',
    adminOnly: true,
    children: [
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      // Node's since W2A-02: edited in place under /setup (D-05), its gate read from ROUTE_GATES.
      {
        id: 'taxes',
        labelKey: 'shell.acs_sales_taxes_submenu',
        href: '/setup/taxes',
        ...navGateOf('/setup/taxes'),
        module: 'taxes',
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      // Node's since W2A-05: edited in place under /setup (D-05), its gate read from ROUTE_GATES.
      {
        id: 'currencies',
        labelKey: 'shell.acs_sales_currencies_submenu',
        href: '/setup/currencies',
        ...navGateOf('/setup/currencies'),
        module: 'currencies',
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      // Node's since W2A-04: edited in place under /setup (D-05), its gate read from ROUTE_GATES.
      {
        id: 'payment-modes',
        labelKey: 'shell.acs_sales_payment_modes_submenu',
        href: '/setup/payment-modes',
        ...navGateOf('/setup/payment-modes'),
        module: 'payment-modes',
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      // Node's since W2A-01: edited in place under /setup (D-05), its gate read from ROUTE_GATES.
      {
        id: 'expenses-categories',
        labelKey: 'shell.acs_expense_categories',
        href: '/setup/expense-categories',
        ...navGateOf('/setup/expense-categories'),
        module: 'expense-categories',
      },
    ],
  },
  // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
  {
    id: 'contracts',
    labelKey: 'shell.acs_contracts',
    adminOnly: true,
    module: 'sales',
    children: [
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'contracts-types',
        labelKey: 'shell.acs_contract_types',
        href: '/admin/contracts/types',
        adminOnly: true,
        module: 'sales',
        legacy: true,
      },
    ],
  },
  // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
  {
    id: 'tasks_masters',
    labelKey: 'shell.tasks',
    adminOnly: true,
    module: 'projects',
    children: [
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'task-repeat-master',
        labelKey: 'shell.task_repeat_master',
        href: '/admin/task_masters/repeat',
        adminOnly: true,
        module: 'projects',
        legacy: true,
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'task-related-master',
        labelKey: 'shell.task_related_master',
        href: '/admin/task_masters/related',
        adminOnly: true,
        module: 'projects',
        legacy: true,
      },
      // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
      {
        id: 'task-priority-master',
        labelKey: 'shell.task_priority_master',
        href: '/admin/task_masters/priority',
        adminOnly: true,
        module: 'projects',
        legacy: true,
      },
    ],
  },
  {
    id: 'estimate_request',
    labelKey: 'shell.acs_estimate_request',
    permission: PERMISSIONS.settings.general.view,
    module: 'sales',
    children: [
      {
        id: 'estimate-request-forms',
        labelKey: 'shell.acs_estimate_request_forms',
        href: '/admin/estimate_request/forms',
        permission: PERMISSIONS.settings.general.view,
        module: 'sales',
        legacy: true,
      },
      {
        id: 'estimate-request-statuses',
        labelKey: 'shell.acs_estimate_request_statuses_submenu',
        href: '/admin/estimate_request/statuses',
        permission: PERMISSIONS.settings.general.view,
        module: 'sales',
        legacy: true,
      },
    ],
  },
  // Setup > Email (04.3 UI-SPEC § Sidebar, choice 8): a container in the place of Perfex's Email
  // Templates item. Node's three screens take their gates from ROUTE_GATES; Perfex's own list stays one
  // row below for Perfex's own emails (D-03) until the last module leaves Perfex (ADR-0028). The
  // container carries no gate: it is shown while any child is (the Sidebar drops an empty container).
  {
    id: 'email',
    labelKey: 'shell.settings_group_email',
    module: 'settings',
    children: [
      {
        id: 'email-templates',
        labelKey: 'shell.acs_email_templates',
        href: '/setup/email-templates',
        ...navGateOf('/setup/email-templates'),
        module: 'settings',
      },
      {
        id: 'email-templates-perfex',
        labelKey: 'shell.perfex_email_templates',
        href: '/admin/emails',
        permission: PERMISSIONS.settings.emailTemplates.view,
        module: 'settings',
        legacy: true,
      },
      {
        id: 'sent-emails',
        labelKey: 'shell.sent_emails',
        href: '/setup/sent-emails',
        ...navGateOf('/setup/sent-emails'),
        module: 'settings',
      },
      {
        id: 'email-status',
        labelKey: 'shell.email_status',
        href: '/setup/email-status',
        ...navGateOf('/setup/email-status'),
        module: 'settings',
      },
    ],
  },
  // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
  {
    id: 'custom-fields',
    labelKey: 'shell.asc_custom_fields',
    href: '/admin/custom_fields',
    adminOnly: true,
    legacy: true,
  },
  // admin-only: the Perfex gate is `is_admin()`, which no permission code can express (ADR-0034 d.2)
  {
    id: 'gdpr',
    labelKey: 'shell.gdpr_short',
    href: '/admin/gdpr',
    adminOnly: true,
    legacy: true,
  },
  // admin-only on BOTH sides since 2026-09-24, and declared once: the gate comes from ROUTE_GATES
  // (`navGateOf`), which the api's own handlers are tested against.
  {
    id: 'roles',
    labelKey: 'shell.acs_roles',
    href: '/setup/roles',
    ...navGateOf('/setup/roles'),
    module: 'staff',
  },
  {
    id: 'settings',
    labelKey: 'shell.acs_settings',
    href: '/admin/settings',
    permission: PERMISSIONS.settings.general.view,
    module: 'settings',
    legacy: true,
  },
];

/** Every item of both exports, depth-first in declared order — the lookup `routes.ts` walks. */
export function flattenNavigation(
  items: readonly NavItem[] = [...NAVIGATION, ...SETUP_NAVIGATION],
): readonly NavItem[] {
  return items.flatMap((item) => [item, ...flattenNavigation(item.children ?? [])]);
}
