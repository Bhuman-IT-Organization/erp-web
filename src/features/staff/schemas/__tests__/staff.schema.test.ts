import { describe, expect, it } from 'vitest';
import type { Me } from '@/lib/auth/use-permissions';
import en from '../../messages/en.json';
import {
  actionOf,
  actorSchema,
  createStaffMemberFormSchema,
  EMPTY_STAFF_MEMBER_FORM,
  featureOf,
  isStaffMemberField,
  PASSWORD_MIN,
  permissionCatalogueSchema,
  resourceLabel,
  STAFF_MESSAGE_KEYS,
  staffMemberDetailSchema,
  SYSTEM_DEFAULT_LANGUAGE,
  staffMemberSchema,
  toCreateStaffMemberBody,
  toPermissionModules,
  toStaffMemberForm,
  toUpdateStaffMemberBody,
  updateStaffMemberFormSchema,
  validationIssuesSchema,
  type StaffMemberFormValues,
} from '../staff.schema';

const ROW = {
  staffId: 4,
  email: 'someone@example.invalid',
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
  skype: 'ada',
  hourlyRate: 12.5,
  defaultLanguage: 'english',
  direction: 'ltr',
  emailSignature: null,
  mediaPathSlug: 'ada-lovelace',
  roleName: 'Support',
  isNotStaff: false,
  departmentIds: [2, 5],
  permissions: ['sales.invoices.view', 'sales.invoices.create'],
};

const ME = {
  staffId: 9,
  email: 'admin@example.invalid',
  firstName: 'A',
  lastName: 'B',
  isAdmin: true,
  roleId: null,
  permissions: ['staff.members.view'],
  locale: null,
};

const FILLED: StaffMemberFormValues = {
  ...EMPTY_STAFF_MEMBER_FORM,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'someone@example.invalid',
  hourlyRate: '12.5',
  roleId: '3',
  departmentIds: ['2'],
  permissions: ['sales.invoices.view'],
  password: 'a-long-enough-password',
};

/** What an api without the photo and last-login fields answers for them: the defaults. */
const NO_PHOTO = { profileImageUrl: null, profileImagePreviewUrl: null, lastLogin: null };

describe('staff schemas', () => {
  it('parses a list row and refuses one missing a field', () => {
    expect(staffMemberSchema.parse(ROW)).toEqual({ ...ROW, ...NO_PHOTO });
    expect(staffMemberSchema.safeParse({ staffId: 4, email: 'a@b.co' }).success).toBe(false);
    // `roleName` is the Role column's text and the api always sends it (`null` for no role), so a
    // row without it is a mirror that has drifted, not a row the screen may render.
    const withoutRoleName = Object.fromEntries(
      Object.entries(ROW).filter(([key]) => key !== 'roleName'),
    );
    expect(staffMemberSchema.safeParse(withoutRoleName).success).toBe(false);
    expect(staffMemberSchema.parse({ ...ROW, roleId: null, roleName: null }).roleName).toBeNull();
  });

  it('a list row carries the 96 px thumbnail, the 320 px preview and the last login; an older api without them reads as null (deploy-order safe)', () => {
    const withPhoto = {
      ...ROW,
      profileImageUrl: '/files/4/small_a.png',
      profileImagePreviewUrl: '/files/4/thumb_a.png',
      lastLogin: '2026-09-01T08:00:00.000Z',
    };
    expect(staffMemberSchema.parse(withPhoto)).toEqual(withPhoto);
    expect(staffMemberSchema.parse(ROW)).toMatchObject(NO_PHOTO);
    expect(staffMemberDetailSchema.parse(DETAIL)).toMatchObject({
      profileImageUrl: null,
      profileImagePreviewUrl: null,
    });
    expect(
      staffMemberDetailSchema.parse({ ...DETAIL, profileImagePreviewUrl: '/files/4/thumb_a.png' })
        .profileImagePreviewUrl,
    ).toBe('/files/4/thumb_a.png');
  });

  it('the detail schema carries the departments and the permission set the list row has not', () => {
    const parsed = staffMemberDetailSchema.parse(DETAIL);
    expect(parsed.departmentIds).toEqual([2, 5]);
    expect(parsed.permissions).toHaveLength(2);
    // The list row is not the detail: parsing the list row with the detail schema must fail, which
    // is why the feature carries two schemas and never reads one member through `useOne`.
    expect(staffMemberDetailSchema.safeParse(ROW).success).toBe(false);
  });

  it('actorSchema mirrors the /me payload usePermissions reads, field for field', () => {
    // Typed, not asserted: the two hooks share one SWR key, so a narrower schema here would strip
    // `permissions` from the object the menu reads (`Me` is `use-permissions`' own type).
    const actor: Me = actorSchema.parse(ME);
    expect(actor.isAdmin).toBe(true);
    expect(actor.permissions).toEqual(['staff.members.view']);
    expect(actor.disabledModules).toEqual([]);
    // The shared cache entry keeps the module switch for the menu (ADR-0042).
    expect(actorSchema.parse({ ...ME, disabledModules: ['sample'] }).disabledModules).toEqual([
      'sample',
    ]);
  });

  it('the catalogue schema parses the module → resource → action tree', () => {
    const parsed = permissionCatalogueSchema.parse({
      data: [
        {
          module: 'sales',
          resources: [
            {
              resource: 'invoices',
              actions: [{ action: 'view', code: 'sales.invoices.view' }],
            },
          ],
        },
      ],
      meta: { total: 1 },
    });
    expect(parsed.data[0]?.resources[0]?.actions[0]?.code).toBe('sales.invoices.view');
  });

  it('the form resolvers report message KEYS, and every key exists in en.json', () => {
    const result = createStaffMemberFormSchema.safeParse({
      ...EMPTY_STAFF_MEMBER_FORM,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
    expect(messages).toContain(STAFF_MESSAGE_KEYS.firstName);
    expect(messages).toContain(STAFF_MESSAGE_KEYS.lastName);
    expect(messages).toContain(STAFF_MESSAGE_KEYS.email);
    expect(messages).toContain(STAFF_MESSAGE_KEYS.password);
    for (const key of Object.values(STAFF_MESSAGE_KEYS)) {
      expect(en.staff, key).toHaveProperty(key);
    }
  });

  it('create requires a password of the api minimum; edit accepts the empty box as "unchanged"', () => {
    const short = { ...FILLED, password: 'a'.repeat(PASSWORD_MIN - 1) };
    expect(createStaffMemberFormSchema.safeParse(short).success).toBe(false);
    expect(updateStaffMemberFormSchema.safeParse(short).success).toBe(false);
    expect(updateStaffMemberFormSchema.safeParse({ ...FILLED, password: '' }).success).toBe(true);
    expect(createStaffMemberFormSchema.safeParse({ ...FILLED, password: '' }).success).toBe(false);
  });

  it('an administrator body carries the three granting fields; a non-admin body carries NONE', () => {
    const asAdmin = toCreateStaffMemberBody(FILLED, true);
    expect(asAdmin.roleId).toBe(3);
    expect(asAdmin.permissions).toEqual(['sales.invoices.view']);
    expect(asAdmin.admin).toBe(false);

    const asMember = toCreateStaffMemberBody(FILLED, false);
    expect(Object.keys(asMember)).not.toContain('roleId');
    expect(Object.keys(asMember)).not.toContain('permissions');
    expect(Object.keys(asMember)).not.toContain('admin');
    expect(asMember.email).toBe(FILLED.email);
    expect(asMember.departmentIds).toEqual([2]);
  });

  it('an administrator stores no permission rows: ticking `admin` sends an empty set', () => {
    const body = toCreateStaffMemberBody({ ...FILLED, admin: true }, true);
    expect(body.admin).toBe(true);
    expect(body.permissions).toEqual([]);
  });

  it('the update body omits an empty password and turns every empty box into null', () => {
    const body = toUpdateStaffMemberBody({ ...FILLED, password: '', roleId: '' }, true);
    expect(Object.keys(body)).not.toContain('password');
    expect(body.phoneNumber).toBeNull();
    expect(body.facebook).toBeNull();
    expect(body.defaultLanguage).toBeNull();
    expect(body.roleId).toBeNull();
    expect(toUpdateStaffMemberBody(FILLED, true).password).toBe(FILLED.password);
  });

  it('a loaded member becomes form values with an empty password box', () => {
    const values = toStaffMemberForm(staffMemberDetailSchema.parse(DETAIL));
    expect(values.password).toBe('');
    expect(values.roleId).toBe('3');
    expect(values.skype).toBe('ada');
    // The choice controls hold strings; the body turns them back into the api's numbers.
    expect(values.departmentIds).toEqual(['2', '5']);
    expect(toUpdateStaffMemberBody(values, true).departmentIds).toEqual([2, 5]);
    expect(values.admin).toBe(false);
  });

  it("resourceLabel turns the api's resource identifier into a readable name", () => {
    expect(resourceLabel('invoices')).toBe('Invoices');
    expect(resourceLabel('payslipTemplate')).toBe('Payslip template');
    expect(resourceLabel('bonusKpi')).toBe('Bonus KPI');
    expect(resourceLabel('manageQA')).toBe('Manage QA');
    expect(resourceLabel('bulkPdfExporter')).toBe('Bulk PDF exporter');
    expect(resourceLabel('settingCustomField')).toBe('Setting custom field');
  });

  it('resourceLabel names faf as Perfex does: "FAF Request" (purchase_lang.php pur_faf_requests, lead 2026-09-27)', () => {
    expect(resourceLabel('faf')).toBe('FAF Request');
  });

  it('resourceLabel names orgchart "Org chart", not the run-together "Orgchart" (lead 2026-09-27)', () => {
    expect(resourceLabel('orgchart')).toBe('Org chart');
  });

  it('splits a clean name into its feature and its action', () => {
    expect(featureOf('sales.invoices.view')).toBe('sales.invoices');
    expect(actionOf('sales.invoices.view')).toBe('view');
  });

  it('validationIssuesSchema accepts the api issue shape and rejects anything else', () => {
    expect(
      validationIssuesSchema.parse([{ path: ['email'], message: 'Invalid', code: 'invalid' }]),
    ).toEqual([{ path: ['email'], message: 'Invalid' }]);
    expect(validationIssuesSchema.safeParse('garbage').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'email' }]).success).toBe(false);
  });

  it('Direction is gone (finding 8): the api still sends it, but no staff schema, form value, default or body carries it', () => {
    // The wire fixture keeps the api's `direction`, so this proves the mirror drops it.
    expect(DETAIL).toHaveProperty('direction');
    expect(staffMemberDetailSchema.parse(DETAIL)).not.toHaveProperty('direction');
    expect(EMPTY_STAFF_MEMBER_FORM).not.toHaveProperty('direction');
    expect(toStaffMemberForm(staffMemberDetailSchema.parse(DETAIL))).not.toHaveProperty(
      'direction',
    );
    expect(toCreateStaffMemberBody(FILLED, true)).not.toHaveProperty('direction');
    expect(toUpdateStaffMemberBody(FILLED, false)).not.toHaveProperty('direction');
    expect(createStaffMemberFormSchema.shape).not.toHaveProperty('direction');
  });

  it('toPermissionModules maps the catalogue into the PermissionPicker modules: a readable feature name, and each capability keeps its code and action and gets a label', () => {
    const modules = toPermissionModules(
      permissionCatalogueSchema.parse({
        data: [
          {
            module: 'sales',
            resources: [
              {
                resource: 'invoices',
                actions: [
                  { action: 'view', code: 'sales.invoices.view' },
                  { action: 'approve', code: 'sales.invoices.approve' },
                  { action: 'odd', code: 'sales.invoices.odd' },
                ],
              },
            ],
          },
        ],
        meta: { total: 3 },
      }),
      { module: (id) => `M:${id}`, capability: (key) => `C:${key}` },
    );
    expect(modules).toEqual([
      {
        id: 'sales',
        label: 'M:sales',
        features: [
          {
            id: 'sales.invoices',
            label: 'Invoices',
            capabilities: [
              { code: 'sales.invoices.view', action: 'view', label: 'C:permission_view' },
              { code: 'sales.invoices.approve', action: 'approve', label: 'C:permission_approve' },
              {
                code: 'sales.invoices.odd',
                action: 'odd',
                label: 'C:permission_unknown_capability',
              },
            ],
          },
        ],
      },
    ]);
  });

  it('the hourly rate box holds text and the body sends the number (empty is 0); "System Default" is a token the body sends as null', () => {
    expect(toUpdateStaffMemberBody(FILLED, true).hourlyRate).toBe(12.5);
    expect(toUpdateStaffMemberBody({ ...FILLED, hourlyRate: '' }, true).hourlyRate).toBe(0);
    expect(updateStaffMemberFormSchema.safeParse({ ...FILLED, hourlyRate: '-1' }).success).toBe(
      false,
    );
    expect(updateStaffMemberFormSchema.safeParse({ ...FILLED, hourlyRate: '12,5' }).success).toBe(
      false,
    );
    expect(EMPTY_STAFF_MEMBER_FORM.defaultLanguage).toBe(SYSTEM_DEFAULT_LANGUAGE);
    expect(toCreateStaffMemberBody(EMPTY_STAFF_MEMBER_FORM, true).defaultLanguage).toBeNull();
    const english = toStaffMemberForm(staffMemberDetailSchema.parse(DETAIL));
    expect(english.defaultLanguage).toBe('english');
    expect(english.hourlyRate).toBe('12.5');
    expect(toUpdateStaffMemberBody(english, true).defaultLanguage).toBe('english');
    const none = toStaffMemberForm(
      staffMemberDetailSchema.parse({ ...DETAIL, defaultLanguage: null }),
    );
    expect(none.defaultLanguage).toBe(SYSTEM_DEFAULT_LANGUAGE);
  });

  it('only the four api-named fields are field errors', () => {
    expect(isStaffMemberField('email')).toBe(true);
    expect(isStaffMemberField('firstName')).toBe(true);
    expect(isStaffMemberField('permissions')).toBe(false);
    expect(isStaffMemberField(0)).toBe(false);
  });
});
