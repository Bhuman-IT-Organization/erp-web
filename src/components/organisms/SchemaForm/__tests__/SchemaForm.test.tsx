// @vitest-environment happy-dom
import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import commonAr from '@/messages/common/ar.json';
import commonEn from '@/messages/common/en.json';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import { SchemaForm, type FormSectionSpec, type SchemaFormProps } from '../SchemaForm';

const COMMON = commonEn.common;
const SUBMIT = 'Save staff member';
const PENDING = 'Saving staff member…';

/** zod carries message KEYS; the feature translates them (FE-12). Test-local fixture map. */
const MESSAGES = {
  field_required: 'This field is required.',
  enter_valid_email: 'Enter a valid e-mail address.',
  enter_valid_url: 'Enter a full address.',
  choose_one: 'Choose at least one.',
} as const;
const translate = (key: string): string =>
  new Map<string, string>(Object.entries(MESSAGES)).get(key) ?? key;

const fieldsSchema = {
  firstName: z.string().min(1, 'field_required'),
  lastName: z.string().min(1, 'field_required'),
  email: z.email('enter_valid_email'),
  phone: z.string(),
  signature: z.string(),
  facebook: z.string(),
  contact: z.string().nullable(),
  departments: z.array(z.string()),
  password: z.string(),
  roleId: z.string().nullable(),
  amount: z.string(),
  notify: z.boolean(),
};
const baseSchema = z.object(fieldsSchema);
const choicesSchema = z.object({
  ...fieldsSchema,
  contact: z
    .string()
    .nullable()
    .refine((value) => value !== null && value !== '', 'choose_one'),
  departments: z.array(z.string()).min(1, 'choose_one'),
});
type Values = z.infer<typeof baseSchema>;

const EMPTY: Values = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  signature: '',
  facebook: '',
  contact: null,
  departments: [],
  password: '',
  roleId: null,
  amount: '',
  notify: false,
};

const optionsOf = (count: number): { value: string; label: string }[] =>
  Array.from({ length: count }, (_, index) => ({
    value: String(index + 1),
    label: `Option ${String(index + 1)}`,
  }));

const PROFILE: FormSectionSpec<Values> = {
  id: 'profile',
  title: 'Profile',
  fields: [
    { name: 'firstName', label: 'First Name', kind: 'text', required: true },
    { name: 'lastName', label: 'Last Name', kind: 'text', required: true },
    { name: 'email', label: 'Email', kind: 'email', required: true },
    { name: 'phone', label: 'Phone', kind: 'tel', helper: 'With the country code.' },
    { name: 'signature', label: 'Email Signature', kind: 'textarea' },
  ],
  disclosure: {
    title: 'Social profiles',
    fields: [{ name: 'facebook', label: 'Facebook', kind: 'text' }],
  },
};

const CHOICES: FormSectionSpec<Values> = {
  id: 'contact',
  title: 'Contact',
  fields: [
    { name: 'contact', label: 'Contact by', kind: 'choice', required: true, options: optionsOf(4) },
    {
      name: 'departments',
      label: 'Departments',
      kind: 'choice',
      multiple: true,
      required: true,
      options: optionsOf(3),
    },
  ],
};

interface HarnessProps extends Partial<Omit<SchemaFormProps<Values>, 'form' | 'id'>> {
  readonly defaults?: Partial<Values>;
  readonly strict?: boolean;
}

/** A screen as plan 16 writes one: `useForm` with a zod resolver, then field specs. */
function Harness({ defaults, strict = false, ...props }: HarnessProps): ReactElement {
  const form = useForm<Values>({
    resolver: zodResolver(strict ? choicesSchema : baseSchema),
    defaultValues: { ...EMPTY, ...defaults },
  });
  return (
    <>
      <button
        type="button"
        onClick={() => {
          form.setError('email', { message: 'enter_valid_email' });
        }}
      >
        server email issue
      </button>
      <button
        type="button"
        onClick={() => {
          form.setError('facebook', { message: 'enter_valid_url' });
        }}
      >
        server facebook issue
      </button>
      <SchemaForm
        id="member"
        form={form}
        sections={[PROFILE]}
        onValid={vi.fn()}
        translateError={translate}
        submitLabel={SUBMIT}
        pendingLabel={PENDING}
        isPending={false}
        onBack={vi.fn()}
        {...props}
      />
    </>
  );
}

/** A single choice whose options arrive later, as a feature's SWR read does. */
function ArrivingChoice(): ReactElement {
  const [options, setOptions] = useState<{ value: string; label: string }[] | undefined>(undefined);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOptions(optionsOf(5));
        }}
      >
        load
      </button>
      <Harness
        sections={[
          {
            id: 'contact',
            title: 'Contact',
            fields: [
              { name: 'contact', label: 'Contact by', kind: 'choice', options },
              { name: 'phone', label: 'Phone', kind: 'tel' },
            ],
          },
        ]}
      />
    </>
  );
}

/** By accessible name: the aria-hidden asterisk is not part of it. */
const textbox = (name: string): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>('textbox', { name });

/**
 * A long lookup whose shape the SCREEN already knows (Role: 21 options), declared half-width with
 * `span: 'short'` (lead decision (a), 2026-09-26): the kit cannot know the loaded width, the screen
 * can, so the cell never moves when the options arrive.
 */
function ArrivingLookup(): ReactElement {
  const [options, setOptions] = useState<{ value: string; label: string }[] | undefined>(undefined);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOptions(optionsOf(21));
        }}
      >
        load
      </button>
      <Harness
        sections={[
          {
            id: 'access',
            title: 'Access',
            fields: [
              { name: 'roleId', label: 'Role', kind: 'choice', options, span: 'short' },
              { name: 'phone', label: 'Phone', kind: 'tel' },
            ],
          },
        ]}
      />
    </>
  );
}

const cell = (name: string): string[] =>
  document.querySelector(`[data-field="${name}"]`)?.className.split(' ') ?? [];

const summaryLinks = (): string[] =>
  within(screen.getByTestId('error-summary'))
    .getAllByRole('link')
    .map((link) => link.textContent);

async function dirtyThenSubmit(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  // The submit is disabled while clean, so a member types something first, as in real use.
  await user.type(textbox('Phone'), '050');
  await user.click(screen.getByRole('button', { name: SUBMIT }));
}

describe('SchemaForm (D-01, D-24, D-29, D-35: specs in, one consistent form out)', () => {
  it('renders one card, one h2 per section, the required legend once, short fields without col-span and the textarea across both columns', () => {
    renderWithProviders(
      <Harness
        sections={[
          PROFILE,
          {
            id: 'extra',
            title: 'Extra',
            fields: [{ name: 'amount', label: 'Amount', kind: 'amount' }],
          },
        ]}
      />,
    );
    expect(document.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Profile',
      'Extra',
    ]);
    expect(screen.getAllByText(COMMON.required_legend)).toHaveLength(1);
    expect(cell('firstName')).not.toContain('md:col-span-2');
    expect(cell('lastName')).not.toContain('md:col-span-2');
    expect(cell('signature')).toContain('md:col-span-2');
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('a required label shows an aria-hidden red * and its input has aria-required; an optional field has neither', () => {
    renderWithProviders(<Harness />);
    const first = textbox('First Name');
    expect(first.getAttribute('aria-required')).toBe('true');
    const mark = document.querySelector('label[for="member-firstName"] [aria-hidden="true"]');
    expect(mark?.textContent).toBe('*');
    expect(mark?.className.split(' ')).toContain('text-destructive');
    const phone = textbox('Phone');
    expect(phone.hasAttribute('aria-required')).toBe(false);
    expect(document.querySelector('label[for="member-phone"] [aria-hidden="true"]')).toBeNull();
    // The helper is the control's description.
    expect(phone.getAttribute('aria-describedby')).toBe('member-phone-helper');
    expect(document.getElementById('member-phone-helper')?.textContent).toBe(
      'With the country code.',
    );
  });

  it("a field's helper is caption size: text-xs and muted (UI-SPEC § Field anatomy)", () => {
    renderWithProviders(<Harness />);
    const helper = document.getElementById('member-phone-helper')?.className.split(' ') ?? [];
    expect(helper).toContain('text-xs');
    expect(helper).toContain('text-muted-foreground');
    expect(helper).not.toContain('text-sm');
  });

  it("a checkbox's helper is a footnote under its label text (ps-6), and the checkbox is described by it", () => {
    renderWithProviders(
      <Harness
        sections={[
          {
            id: 'options',
            title: 'Options',
            fields: [
              {
                name: 'notify',
                label: 'Notify the members',
                kind: 'checkbox',
                helper: 'Each member gets an e-mail.',
              },
            ],
          },
        ]}
      />,
    );
    const helper = document.getElementById('member-notify-helper');
    expect(helper?.textContent).toBe('Each member gets an e-mail.');
    expect(helper?.className.split(' ')).toEqual(expect.arrayContaining(['ps-6', 'text-xs']));
    const box = screen.getByRole('checkbox', { name: 'Notify the members' });
    expect(box.getAttribute('aria-describedby')).toBe('member-notify-helper');
  });

  it('a failed submit: each FieldError under its control with aria-invalid, a summary of "<label>: <message>" links, focus on the summary, onValid not called', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    renderWithProviders(<Harness onValid={onValid} />);
    await dirtyThenSubmit(user);
    const summary = await screen.findByTestId('error-summary');
    expect(summary.getAttribute('role')).toBe('alert');
    expect(within(summary).getByText(COMMON.check_these_fields)).toBeDefined();
    expect(summaryLinks()).toEqual([
      'First Name: This field is required.',
      'Last Name: This field is required.',
      'Email: Enter a valid e-mail address.',
    ]);
    const first = textbox('First Name');
    expect(first.getAttribute('aria-invalid')).toBe('true');
    expect(first.getAttribute('aria-describedby')).toBe('member-firstName-error');
    const error = document.getElementById('member-firstName-error');
    expect(error?.textContent).toBe(MESSAGES.field_required);
    // Under its control: the error follows the input in the document.
    expect(
      first.compareDocumentPosition(error as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    await waitFor(() => {
      expect(document.activeElement).toBe(summary);
    });
    expect(onValid).not.toHaveBeenCalled();
  });

  it('a radio group and a checkbox group show their error TEXT under the control, wired by aria-describedby = <id>-error, and in the summary (never colour alone, D-29)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness strict sections={[PROFILE, CHOICES]} />);
    await dirtyThenSubmit(user);
    await screen.findByTestId('error-summary');
    expect(summaryLinks()).toEqual(
      expect.arrayContaining([
        `Contact by: ${MESSAGES.choose_one}`,
        `Departments: ${MESSAGES.choose_one}`,
      ]),
    );
    const radios = screen.getByRole('radiogroup', { name: 'Contact by' });
    const boxes = screen.getByRole('group', { name: `Departments ${COMMON.required_hidden}` });
    for (const [control, id] of [
      [radios, 'member-contact-error'],
      [boxes, 'member-departments-error'],
    ] as const) {
      expect(control.getAttribute('aria-invalid')).toBe('true');
      expect(control.getAttribute('aria-describedby')).toBe(id);
      const text = document.getElementById(id);
      expect(text?.textContent).toBe(MESSAGES.choose_one);
      expect(
        control.compareDocumentPosition(text as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
    }
  });

  it('a summary link for a field inside the closed disclosure opens it and focuses that input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const details = screen.getByText('Social profiles').closest('details');
    expect(details?.open).toBe(false);
    await user.click(screen.getByRole('button', { name: 'server facebook issue' }));
    await user.click(
      await screen.findByRole('link', { name: `Facebook: ${MESSAGES.enter_valid_url}` }),
    );
    expect(details?.open).toBe(true);
    expect(document.activeElement).toBe(textbox('Facebook'));
  });

  it('a server issue set through form.setError renders in the summary exactly like a client one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: 'server email issue' }));
    expect(summaryLinks()).toEqual([`Email: ${MESSAGES.enter_valid_email}`]);
    expect(document.getElementById('member-email-error')?.textContent).toBe(
      MESSAGES.enter_valid_email,
    );
  });

  it('serverError: a destructive alert above the summary with save_failed, the message and Retry; the typed values stay', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(
      <Harness serverError={{ message: 'The server is taking too long to answer.', onRetry }} />,
    );
    await user.type(textbox('First Name'), 'Ada');
    await user.click(screen.getByRole('button', { name: 'server email issue' }));
    const alert = screen.getByTestId('form-server-error');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(within(alert).getByText(COMMON.save_failed)).toBeDefined();
    expect(within(alert).getByText('The server is taking too long to answer.')).toBeDefined();
    expect(
      alert.compareDocumentPosition(screen.getByTestId('error-summary')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    await user.click(within(alert).getByRole('button', { name: COMMON.retry }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(textbox('First Name').value).toBe('Ada');
  });

  it('the save-failed Retry is a 32 px button (size default)', () => {
    renderWithProviders(<Harness serverError={{ message: 'x', onRetry: vi.fn() }} />);
    const alert = screen.getByTestId('form-server-error');
    const retry = within(alert).getByRole('button', { name: COMMON.retry });
    expect(retry.getAttribute('data-size')).toBe('default');
  });

  it('a valid submit calls onValid once with the values', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    renderWithProviders(
      <Harness onValid={onValid} defaults={{ firstName: 'Ada', lastName: 'Lovelace' }} />,
    );
    await user.type(textbox('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: SUBMIT }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledOnce();
    });
    expect(onValid.mock.calls[0]?.[0]).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'a@b.co',
    });
    expect(screen.queryByTestId('error-summary')).toBeNull();
  });

  it('onValid receives { submitter: null } from the primary submit', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    renderWithProviders(
      <Harness
        onValid={onValid}
        defaults={{ firstName: 'Ada', lastName: 'Lovelace' }}
        secondarySubmit={{ name: 'draft', label: 'Save draft', pendingLabel: 'Saving draft…' }}
      />,
    );
    await user.type(textbox('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: SUBMIT }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledOnce();
    });
    expect(onValid.mock.calls[0]?.[1]).toEqual({ submitter: null });
  });

  it('backLabel (opt-in, 04.7-22) names the save bar dismissal; absent it reads "Back to list"', () => {
    const { unmount } = renderWithProviders(<Harness backLabel="Back to the record" />);
    expect(screen.getByRole('button', { name: 'Back to the record' })).toBeTruthy();
    unmount();
    renderWithProviders(<Harness />);
    expect(screen.getByRole('button', { name: 'Back to list' })).toBeTruthy();
  });

  it('onValid receives { submitter: "draft" } from the opt-in secondary submit named draft', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    renderWithProviders(
      <Harness
        onValid={onValid}
        defaults={{ firstName: 'Ada', lastName: 'Lovelace' }}
        secondarySubmit={{ name: 'draft', label: 'Save draft', pendingLabel: 'Saving draft…' }}
      />,
    );
    await user.type(textbox('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledOnce();
    });
    expect(onValid.mock.calls[0]?.[1]).toEqual({ submitter: 'draft' });
  });

  it('isPending disables every control through a disabled fieldset, and the submit reads the pending label', () => {
    renderWithProviders(<Harness isPending sections={[PROFILE, CHOICES]} />);
    const fieldset = document.querySelector('fieldset[data-slot="form-body"]');
    expect(fieldset?.hasAttribute('disabled')).toBe(true);
    for (const control of [
      textbox('First Name'),
      textbox('Email Signature'),
      ...screen.getAllByRole('radio'),
      ...screen.getAllByRole('checkbox'),
    ]) {
      expect(control.hasAttribute('disabled')).toBe(true);
    }
    expect(screen.getByRole<HTMLButtonElement>('button', { name: PENDING }).disabled).toBe(true);
  });

  it('the disclosure opens by itself when a field inside has a value on load', () => {
    renderWithProviders(<Harness defaults={{ facebook: 'example.page' }} />);
    expect(screen.getByText('Social profiles').closest('details')?.open).toBe(true);
  });

  it('kind choice with 7 options renders a combobox; password renders the reveal; custom renders render() full width; amount is a decimal input aligned to the end', () => {
    renderWithProviders(
      <Harness
        sections={[
          {
            id: 'kinds',
            title: 'Kinds',
            fields: [
              { name: 'roleId', label: 'Role', kind: 'choice', options: optionsOf(7) },
              { name: 'password', label: 'Password', kind: 'password' },
              { name: 'amount', label: 'Amount', kind: 'amount' },
              {
                name: 'signature',
                label: 'Signature',
                kind: 'custom',
                render: (field, state) => (
                  <input
                    id={state.id}
                    aria-label="Custom signature"
                    aria-describedby={state.describedBy || undefined}
                    value={typeof field.value === 'string' ? field.value : ''}
                    onChange={field.onChange}
                  />
                ),
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Role' })).toBeDefined();
    expect(screen.getByRole('button', { name: COMMON.show_password })).toBeDefined();
    expect(screen.getByLabelText('Custom signature').id).toBe('member-signature');
    expect(cell('signature')).toContain('md:col-span-2');
    const amount = screen.getByLabelText('Amount');
    expect(amount.getAttribute('inputmode')).toBe('decimal');
    expect(amount.className.split(' ')).toEqual(
      expect.arrayContaining(['text-end', 'tabular-nums']),
    );
  });

  it('a choice field passes its emptyHint: zero options open on the hint and its create link', async () => {
    renderWithProviders(
      <Harness
        sections={[
          {
            id: 'kinds',
            title: 'Kinds',
            fields: [
              {
                name: 'roleId',
                label: 'Role',
                kind: 'choice',
                options: [],
                emptyHint: {
                  text: 'No roles yet.',
                  action: { label: 'Create one in Setup', href: '/setup/roles/new' },
                },
              },
            ],
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Role' }));
    expect(screen.getByText('No roles yet.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Create one in Setup' }).getAttribute('href')).toBe(
      '/setup/roles/new',
    );
  });

  it('a section with loading true shows its heading over field blocks while the other sections stay interactive (D-35)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        sections={[
          PROFILE,
          { id: 'permissions', title: 'Permissions', loading: true, fields: CHOICES.fields },
        ]}
      />,
    );
    const section = screen.getByRole('region', { name: 'Permissions' });
    expect(within(section).getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(within(section).getAllByTestId('skeleton-field')).toHaveLength(2);
    expect(within(section).queryByRole('radiogroup')).toBeNull();
    await user.type(textbox('First Name'), 'Ada');
    expect(textbox('First Name').value).toBe('Ada');
    // D-39: no error, empty or refusal text in the loading section.
    expect(within(section).queryByRole('alert')).toBeNull();
  });

  it('a single choice keeps its grid columns when its options arrive: no reflow (lead 2026-09-26)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArrivingChoice />);
    expect(screen.getByRole('status')).toBeDefined();
    const loading = cell('contact');
    await user.click(screen.getByRole('button', { name: 'load' }));
    expect(screen.getByRole('radiogroup', { name: 'Contact by' })).toBeDefined();
    expect(cell('contact')).toEqual(loading);
    expect(loading).toContain('md:col-span-2');
  });

  it('a screen-declared span wins: a 21-option lookup declared short occupies ONE column while loading and once loaded, and its neighbour shares the row (lead decision (a))', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArrivingLookup />);
    expect(screen.getByRole('status')).toBeDefined();
    const loading = cell('roleId');
    expect(loading).not.toContain('md:col-span-2');
    await user.click(screen.getByRole('button', { name: 'load' }));
    expect(screen.getByRole('combobox', { name: 'Role' })).toBeDefined();
    expect(cell('roleId')).toEqual(loading);
    expect(cell('phone')).not.toContain('md:col-span-2');
  });

  it('notice renders once above the sections; a section notice once at the top of its section, before its first field; readOnly hides the submit', () => {
    renderWithProviders(
      <Harness
        readOnly
        notice={<p>Form notice</p>}
        sections={[{ ...PROFILE, notice: <p>Section notice</p> }]}
      />,
    );
    expect(screen.getAllByText('Form notice')).toHaveLength(1);
    expect(screen.getAllByText('Section notice')).toHaveLength(1);
    const section = screen.getByRole('region', { name: 'Profile' });
    const notice = within(section).getByText('Section notice');
    expect(
      notice.compareDocumentPosition(textbox('First Name')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      screen.getByText('Form notice').compareDocumentPosition(section) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(screen.queryByRole('button', { name: SUBMIT })).toBeNull();
    expect(screen.getByRole('button', { name: COMMON.back_to_list })).toBeDefined();
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(
      <Harness sections={[PROFILE, CHOICES]} serverError={{ message: 'x', onRetry: vi.fn() }} />,
      { locale: 'ar' },
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

const colorSchema = z.object({
  name: z.string(),
  statusColor: z.string().max(7, 'color_too_long'),
});
type ColorValues = z.infer<typeof colorSchema>;
const COLOR_LABEL = 'Status Color';
const COLOR_SUBMIT = 'Save status';

interface ColorHarnessProps {
  readonly defaults?: Partial<ColorValues>;
  readonly onValid?: (values: ColorValues) => void;
  readonly disabled?: boolean;
}

/** A status form as a status screen writes one: a name and a color (D-15). */
function ColorHarness({
  defaults,
  onValid = vi.fn(),
  disabled = false,
}: ColorHarnessProps): ReactElement {
  const form = useForm<ColorValues>({
    resolver: zodResolver(colorSchema),
    defaultValues: { name: '', statusColor: '', ...defaults },
  });
  return (
    <SchemaForm
      id="status"
      form={form}
      sections={[
        {
          id: 'details',
          title: 'Details',
          fields: [
            { name: 'name', label: 'Name', kind: 'text' },
            { name: 'statusColor', label: COLOR_LABEL, kind: 'color', disabled },
          ],
        },
      ]}
      onValid={onValid}
      translateError={(key) => (key === 'color_too_long' ? 'Keep the color short.' : key)}
      submitLabel={COLOR_SUBMIT}
      pendingLabel="Saving status"
      isPending={false}
      onBack={vi.fn()}
    />
  );
}

const colorText = (): HTMLInputElement => textbox(COLOR_LABEL);
const swatch = (): HTMLInputElement =>
  screen.getByLabelText<HTMLInputElement>(COMMON.pick_color_named.replace('{label}', COLOR_LABEL));
const chip = (): HTMLElement => {
  const node = document.querySelector<HTMLElement>('[data-slot="color-chip"]');
  if (node === null) throw new Error('no color chip');
  return node;
};

describe('SchemaForm color kind (D-15: a text value with a picker swatch, blank allowed)', () => {
  it('D-15: a blank colour submits as an empty string', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    renderWithProviders(<ColorHarness onValid={onValid} />);
    expect(colorText().value).toBe('');
    expect(chip().getAttribute('data-state')).toBe('empty');
    await user.type(textbox('Name'), 'Open');
    await user.click(screen.getByRole('button', { name: COLOR_SUBMIT }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });
    expect(onValid.mock.calls[0]?.[0]).toEqual({ name: 'Open', statusColor: '' });
  });

  it('a typed valid hex in any case paints the chip and submits as typed', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    renderWithProviders(<ColorHarness onValid={onValid} />);
    await user.type(colorText(), '#FF0000');
    expect(chip().getAttribute('data-state')).toBe('filled');
    expect(chip().style.backgroundColor).not.toBe('');
    expect(swatch().value.toLowerCase()).toBe('#ff0000');
    await user.click(screen.getByRole('button', { name: COLOR_SUBMIT }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });
    expect(onValid.mock.calls[0]?.[0]).toEqual({ name: '', statusColor: '#FF0000' });
  });

  it('free text (Perfex accepts it) submits as typed, leaves the chip empty and shows no error', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    renderWithProviders(<ColorHarness onValid={onValid} />);
    await user.type(colorText(), 'red');
    expect(chip().getAttribute('data-state')).toBe('empty');
    expect(chip().style.backgroundColor).toBe('');
    await user.click(screen.getByRole('button', { name: COLOR_SUBMIT }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });
    expect(onValid.mock.calls[0]?.[0]).toEqual({ name: '', statusColor: 'red' });
    expect(colorText().getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByTestId('error-summary')).toBeNull();
  });

  it('a pick in the native picker sets the text to the lowercase hex and marks the form dirty', () => {
    renderWithProviders(<ColorHarness />);
    expect(screen.getByRole('button', { name: COLOR_SUBMIT }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(swatch(), { target: { value: '#00FF00' } });
    expect(colorText().value).toBe('#00ff00');
    expect(chip().getAttribute('data-state')).toBe('filled');
    expect(screen.getByRole('button', { name: COLOR_SUBMIT }).hasAttribute('disabled')).toBe(false);
  });

  it('clearing a filled value goes back to blank: the empty chip, and it submits as an empty string', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    renderWithProviders(<ColorHarness onValid={onValid} defaults={{ statusColor: '#123456' }} />);
    expect(chip().getAttribute('data-state')).toBe('filled');
    await user.clear(colorText());
    expect(chip().getAttribute('data-state')).toBe('empty');
    await user.click(screen.getByRole('button', { name: COLOR_SUBMIT }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });
    expect(onValid.mock.calls[0]?.[0]).toEqual({ name: '', statusColor: '' });
  });

  it('the text input carries the label, the id and dir ltr; the swatch is named "Pick a color for {label}" and comes after it', () => {
    renderWithProviders(<ColorHarness />);
    expect(colorText().id).toBe('status-statusColor');
    expect(colorText().getAttribute('dir')).toBe('ltr');
    expect(colorText().getAttribute('spellcheck')).toBe('false');
    expect(colorText().getAttribute('autocomplete')).toBe('off');
    expect(swatch().getAttribute('type')).toBe('color');
    expect(
      colorText().compareDocumentPosition(swatch()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(swatch().hasAttribute('aria-describedby')).toBe(false);
  });

  it('a disabled field disables both the text and the swatch, and dims the chip', () => {
    renderWithProviders(<ColorHarness disabled defaults={{ statusColor: '#123456' }} />);
    expect(colorText().disabled).toBe(true);
    expect(swatch().disabled).toBe(true);
    expect(chip().className.split(' ')).toContain('opacity-50');
  });

  it('under ar the value stays left-to-right, the swatch keeps its Arabic name, and no physical-direction class is used', () => {
    const { container } = renderWithProviders(
      <ColorHarness defaults={{ statusColor: '#123456' }} />,
      {
        locale: 'ar',
      },
    );
    expect(colorText().getAttribute('dir')).toBe('ltr');
    expect(
      screen.getByLabelText(commonAr.common.pick_color_named.replace('{label}', COLOR_LABEL)),
    ).toBeDefined();
    expect(physicalClassesIn(container)).toEqual([]);
  });

  it('a value holding markup is text: no element is created from it and the chip stays empty', () => {
    const { container } = renderWithProviders(
      <ColorHarness defaults={{ statusColor: '<b>x</b>' }} />,
    );
    expect(container.querySelector('b')).toBeNull();
    expect(colorText().value).toBe('<b>x</b>');
    expect(chip().getAttribute('data-state')).toBe('empty');
    expect(chip().style.backgroundColor).toBe('');
  });

  it('a zod max(7) error shows under the text input with aria-invalid, in the summary, and onValid is not called', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    renderWithProviders(<ColorHarness onValid={onValid} />);
    await user.type(colorText(), '#1234567');
    await user.click(screen.getByRole('button', { name: COLOR_SUBMIT }));
    expect(await screen.findByTestId('error-summary')).toBeDefined();
    expect(colorText().getAttribute('aria-invalid')).toBe('true');
    expect(colorText().getAttribute('aria-describedby')).toBe('status-statusColor-error');
    expect(document.getElementById('status-statusColor-error')?.textContent).toContain(
      'Keep the color short.',
    );
    expect(onValid).not.toHaveBeenCalled();
  });
});
