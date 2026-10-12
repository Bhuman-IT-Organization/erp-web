import { zodResolver } from '@hookform/resolvers/zod';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactElement, ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { expect, fn, userEvent, within } from 'storybook/test';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SchemaForm, type FormSectionSpec } from './SchemaForm';

/**
 * Neutral fixtures (FE-05): the staff form's common case as plan 16 will write it — First and Last
 * Name, Email and Phone, Role and Default Language, Departments, Administrator and Password, with
 * the social profiles behind one disclosure. Labels, messages and the verb + noun submit arrive
 * translated, as a screen passes them.
 */
const MESSAGES = {
  field_required: 'This field is required.',
  enter_valid_email: 'Enter a valid e-mail address.',
  choose_one: 'Choose one.',
  color_too_long: 'Keep the color to 7 characters or fewer.',
} as const;
const translate = (key: string): string =>
  new Map<string, string>(Object.entries(MESSAGES)).get(key) ?? key;

const shape = {
  firstName: z.string().min(1, 'field_required'),
  lastName: z.string().min(1, 'field_required'),
  email: z.email('enter_valid_email'),
  phone: z.string(),
  roleId: z.string().nullable(),
  language: z.string().nullable(),
  employment: z.string().nullable(),
  departments: z.array(z.string()),
  admin: z.boolean(),
  password: z.string(),
  facebook: z.string(),
  linkedin: z.string(),
  skype: z.string(),
  color: z.string().max(7, 'color_too_long'),
};
const schema = z.object(shape);
/** FieldErrors: the radio and the checkbox group are required, so both show their error text. */
const strictSchema = z.object({
  ...shape,
  employment: z
    .string()
    .nullable()
    .refine((value) => value !== null, 'choose_one'),
  departments: z.array(z.string()).min(1, 'choose_one'),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  roleId: null,
  language: null,
  employment: null,
  departments: [],
  admin: false,
  password: '',
  facebook: '',
  linkedin: '',
  skype: '',
  color: '',
};

const FILLED: Partial<Values> = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'a@b.co',
  roleId: '3',
  language: 'en',
  departments: ['2'],
};

const optionsOf = (labels: readonly string[]): { value: string; label: string }[] =>
  labels.map((label, index) => ({ value: String(index + 1), label }));

const ROLES = optionsOf(Array.from({ length: 21 }, (_, index) => `Role ${String(index + 1)}`));
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
  ...optionsOf(Array.from({ length: 26 }, (_, index) => `Language ${String(index + 3)}`)),
];
const DEPARTMENTS = optionsOf(['Accounts', 'Customer Service', 'Human Resources', 'Sales']);
const EMPLOYMENT = optionsOf(['Full time', 'Part time', 'Contractor', 'Intern']);

const SOCIAL = {
  title: 'Social profiles',
  fields: [
    { name: 'facebook', label: 'Facebook', kind: 'text' },
    { name: 'linkedin', label: 'LinkedIn', kind: 'text' },
    { name: 'skype', label: 'Skype', kind: 'text' },
  ],
} as const satisfies FormSectionSpec<Values>['disclosure'];

function profile(options: {
  readonly roles?: typeof ROLES | undefined;
  readonly withEmployment?: boolean;
}): FormSectionSpec<Values> {
  return {
    id: 'profile',
    title: 'Profile',
    fields: [
      { name: 'firstName', label: 'First Name', kind: 'text', required: true },
      { name: 'lastName', label: 'Last Name', kind: 'text', required: true },
      { name: 'email', label: 'Email', kind: 'email', required: true },
      { name: 'phone', label: 'Phone', kind: 'tel' },
      { name: 'roleId', label: 'Role', kind: 'choice', options: options.roles },
      { name: 'language', label: 'Default Language', kind: 'choice', options: LANGUAGES },
      ...(options.withEmployment === true
        ? ([
            {
              name: 'employment',
              label: 'Employment type',
              kind: 'choice',
              required: true,
              options: EMPLOYMENT,
            },
          ] as const)
        : []),
      {
        name: 'departments',
        label: 'Departments',
        kind: 'choice',
        multiple: true,
        required: options.withEmployment === true,
        options: DEPARTMENTS,
      },
      { name: 'admin', label: 'Administrator', kind: 'checkbox' },
      { name: 'password', label: 'Password', kind: 'password' },
    ],
    disclosure: SOCIAL,
  };
}

/** D-15: a status form's name and color, as a status screen writes one. */
function appearance(options: { readonly disabled?: boolean } = {}): FormSectionSpec<Values> {
  return {
    id: 'appearance',
    title: 'Details',
    fields: [
      { name: 'firstName', label: 'Status Name', kind: 'text', required: true },
      {
        name: 'color',
        label: 'Status Color',
        kind: 'color',
        ...(options.disabled === true ? { disabled: true } : {}),
      },
    ],
  };
}

const PERMISSIONS: FormSectionSpec<Values> = {
  id: 'permissions',
  title: 'Permissions',
  loading: true,
  fields: [
    { name: 'roleId', label: 'Role', kind: 'choice', options: undefined },
    { name: 'departments', label: 'Departments', kind: 'choice', multiple: true },
  ],
};

interface DemoProps {
  readonly sections: readonly FormSectionSpec<Values>[];
  readonly defaults?: Partial<Values>;
  readonly strict?: boolean;
  readonly isPending?: boolean;
  readonly readOnly?: boolean;
  readonly serverError?: { readonly message: string; readonly onRetry?: () => void } | null;
  readonly notice?: ReactNode;
  readonly submitLabel?: string;
  readonly pendingLabel?: string;
  readonly onValid?: (values: Values) => void;
  readonly onBack?: () => void;
}

/** A screen as plan 16 writes one: `useForm` + zod, then field specs into the kit. */
function Demo({
  sections,
  defaults,
  strict = false,
  isPending = false,
  readOnly = false,
  serverError = null,
  notice,
  submitLabel = 'Save staff member',
  pendingLabel = 'Saving staff member…',
  onValid = () => undefined,
  onBack = () => undefined,
}: DemoProps): ReactElement {
  const form = useForm<Values>({
    resolver: zodResolver(strict ? strictSchema : schema),
    defaultValues: { ...EMPTY, ...defaults },
  });
  return (
    <SchemaForm
      id="story-member"
      form={form}
      sections={sections}
      onValid={onValid}
      translateError={translate}
      submitLabel={submitLabel}
      pendingLabel={pendingLabel}
      isPending={isPending}
      onBack={onBack}
      serverError={serverError}
      notice={notice}
      readOnly={readOnly}
    />
  );
}

/** One card of named sections, no tabs; the kit picks every control, width and marker (D-01, D-24). */
const meta = {
  title: 'Organisms/SchemaForm',
  component: Demo,
  parameters: { layout: 'padded' },
  args: {
    sections: [profile({ roles: ROLES })],
    defaults: FILLED,
    onValid: fn(),
    onBack: fn(),
  },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The common case at 1366 × 768: it fits one viewport above the save bar. */
export const Default: Story = {};

/** A member has typed: "Unsaved changes", and the submit is enabled. */
export const Dirty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Phone' }), '050 123 4567');
    await expect(canvas.getByRole('button', { name: 'Save staff member' })).toBeEnabled();
  },
};

/**
 * FE-27 field errors after a failed submit: each message is TEXT under its control — the text
 * inputs, the radio group and the checkbox group alike, each linked by `aria-describedby` — and the
 * summary at the top names every failing field by label and takes focus (D-29, WCAG 1.4.1).
 */
export const FieldErrors: Story = {
  args: { strict: true, defaults: {}, sections: [profile({ roles: ROLES, withEmployment: true })] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Phone' }), '050');
    await userEvent.click(canvas.getByRole('button', { name: 'Save staff member' }));
    await expect(await canvas.findByTestId('error-summary')).toHaveFocus();
  },
};

/** FE-27 server error: an alert inside the form with Retry; the member's edits are still there. */
export const ServerError: Story = {
  args: {
    serverError: {
      message: 'The server is taking too long to answer. Try again in a moment.',
      onRetry: fn(),
    },
  },
};

/** FE-27 pending: every control disabled, the submit reads "Saving staff member…". */
export const Pending: Story = { args: { isPending: true } };

/** A social profile has a value, so its disclosure is open on load. */
export const WithDisclosureOpen: Story = {
  args: { defaults: { ...FILLED, facebook: 'example.page' } },
};

/**
 * D-35: the Permissions section has not arrived — a real heading over field blocks, the rest live.
 * Role's options are still loading too: its block already spans both columns, the width a radio
 * group of 4-6 would take, so nothing reflows when they arrive (lead decision 2026-09-26).
 */
export const SectionLoading: Story = {
  args: { sections: [profile({ roles: undefined }), PERMISSIONS] },
};

/** Nothing to save: the body is disabled, the submit is gone, "Back to list" stays. */
export const ReadOnly: Story = {
  args: {
    readOnly: true,
    notice: (
      <Alert>
        <AlertDescription>Only an administrator can change roles and permissions.</AlertDescription>
      </Alert>
    ),
  },
};

export const Rtl: Story = {
  globals: { locale: 'ar' },
  args: {
    submitLabel: 'حفظ الموظف',
    pendingLabel: 'جارٍ حفظ الموظف…',
    defaults: { firstName: 'أدا', lastName: 'لوفليس', email: 'a@b.co' },
    sections: [
      {
        id: 'profile',
        title: 'الملف الشخصي',
        fields: [
          { name: 'firstName', label: 'الاسم الأول', kind: 'text', required: true },
          { name: 'lastName', label: 'اسم العائلة', kind: 'text', required: true },
          { name: 'email', label: 'البريد الإلكتروني', kind: 'email', required: true },
          { name: 'phone', label: 'رقم الهاتف', kind: 'tel' },
          {
            name: 'departments',
            label: 'الأقسام',
            kind: 'choice',
            multiple: true,
            required: true,
            options: optionsOf(['الحسابات', 'خدمة العملاء', 'الموارد البشرية', 'المبيعات']),
          },
          { name: 'admin', label: 'مسؤول', kind: 'checkbox' },
          { name: 'password', label: 'كلمة المرور', kind: 'password' },
        ],
        disclosure: {
          title: 'الملفات الاجتماعية',
          fields: [{ name: 'facebook', label: 'فيسبوك', kind: 'text' }],
        },
      },
    ],
  },
};

/** 375 px: one column, the save bar wraps its text above the buttons. */
export const Mobile: Story = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

/** D-15: a blank color is allowed: the text is empty and the chip is the dashed "no color" chip. */
export const ColorBlank: Story = {
  args: { sections: [appearance()], defaults: { firstName: 'Open' } },
};

/** A valid hex fills the chip; the text keeps the value as typed. */
export const ColorFilled: Story = {
  args: { sections: [appearance()], defaults: { firstName: 'Open', color: '#2563eb' } },
};

/** Free text (Perfex accepts it): shown as typed, the chip empty, no format error. */
export const ColorUnparsed: Story = {
  args: { sections: [appearance()], defaults: { firstName: 'Open', color: 'blue' } },
};

/** Over the column's cap: the feature's zod error under the text input and in the summary. */
export const ColorTooLong: Story = {
  args: { sections: [appearance()], defaults: { firstName: 'Open', color: '#2563eb0' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Status Name' }), 's');
    await userEvent.click(canvas.getByRole('button', { name: 'Save staff member' }));
    await expect(await canvas.findByTestId('error-summary')).toHaveFocus();
  },
};

/** Disabled: both the text and the swatch, the chip at half opacity. */
export const ColorDisabled: Story = {
  args: {
    sections: [appearance({ disabled: true })],
    defaults: { firstName: 'Open', color: '#2563eb' },
  },
};

/** Under ar: the swatch at the inline end (left), the value still left-to-right. */
export const ColorRtl: Story = {
  globals: { locale: 'ar' },
  args: {
    submitLabel: 'حفظ الحالة',
    pendingLabel: 'جارٍ حفظ الحالة…',
    defaults: { firstName: 'مفتوح', color: '#2563eb' },
    sections: [
      {
        id: 'appearance',
        title: 'التفاصيل',
        fields: [
          { name: 'firstName', label: 'اسم الحالة', kind: 'text', required: true },
          { name: 'color', label: 'لون الحالة', kind: 'color' },
        ],
      },
    ],
  },
};
