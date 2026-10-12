import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { useState, type ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { z } from 'zod';
import { Label } from '@/components/ui/label';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import {
  AsyncSearchableSelect,
  type AsyncOption,
  type AsyncSearchableSelectProps,
} from './AsyncSearchableSelect';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache. It serves 60 synthetic rows ("Sample item 1"
// to "Sample item 60", SKU-0001..., barcode 20000000000NN), filtered by `q` and paged by an offset
// cursor. Fixture data only.
const PATH = '/api/v1/demo/items';
const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;
const ID = 'story-item';

const rowSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  sku: z.string(),
  barcode: z.string(),
  active: z.boolean(),
});
type Row = z.infer<typeof rowSchema>;

const pad = (n: number, width: number) => String(n).padStart(width, '0');
const rows = (name: (n: number) => string): readonly Row[] =>
  Array.from({ length: 60 }, (_, i) => ({
    id: i + 1,
    code: `IT${pad(i + 1, 3)}`,
    name: name(i + 1),
    sku: `SKU-${pad(i + 1, 4)}`,
    barcode: `20000000000${pad(i + 1, 2)}`,
    active: i !== 6,
  }));
const ROWS = rows((n) => `Sample item ${String(n)}`);
const ROWS_AR = rows((n) => `صنف تجريبي ${String(n)}`);

const toOption = (row: Row): AsyncOption => ({
  value: String(row.id),
  label: `${row.code} · ${row.name}`,
  meta: `SKU ${row.sku}`,
  inactive: !row.active,
});
/** The option of the synthetic row with this id. */
const optionOf = (id: number): AsyncOption => {
  const row = ROWS.find((r) => r.id === id);
  if (row === undefined) throw new RangeError(`no row ${String(id)}`);
  return toOption(row);
};
const exactMatch = (query: string, candidates: readonly Row[]) => {
  const hits = candidates.filter((r) => r.barcode === query);
  return hits.length === 1 ? hits[0] : undefined;
};

type Mode = 'serve' | 'pending' | 'fail';

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  const response = {
    data,
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config,
  };
  return status < 300
    ? Promise.resolve(response)
    : Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

/** Sets the transport BEFORE the story renders (synchronously, no effect) and isolates the cache. */
function withApi(mode: Mode, source: readonly Row[] = ROWS): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = (config) => {
      if (mode === 'pending') return new Promise<never>(() => undefined);
      if (mode === 'fail') {
        return respond(config, HTTP_SERVICE_UNAVAILABLE, {
          type: 'about:blank',
          status: HTTP_SERVICE_UNAVAILABLE,
          code: 'ERP-UPSTREAM-0001',
        });
      }
      const query = new URL(config.url ?? '', 'http://story').searchParams;
      const q = (query.get('q') ?? '').toLowerCase();
      const hits = source.filter(
        (r) => q === '' || `${r.name} ${r.sku} ${r.barcode}`.toLowerCase().includes(q),
      );
      const from = Number(query.get('cursor') ?? '0');
      const limit = Number(query.get('limit'));
      return respond(config, HTTP_OK, {
        data: hits.slice(from, from + limit),
        meta: {
          nextCursor: from + limit < hits.length ? String(from + limit) : null,
          prevCursor: null,
        },
      });
    };
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

type StoryProps = Omit<AsyncSearchableSelectProps<Row>, 'onChange'> & { readonly label: string };

/** A controlled host, as a form's Controller is: the picks and their labels are kept. */
function Picker({ label, value, selected, ...rest }: StoryProps): ReactElement {
  const [values, setValues] = useState<readonly string[]>(value);
  const [options, setOptions] = useState<readonly AsyncOption[]>(selected);
  return (
    <div className="flex max-w-sm flex-col gap-1 p-6">
      <Label htmlFor={rest.id}>{label}</Label>
      <AsyncSearchableSelect<Row>
        {...rest}
        value={values}
        selected={options}
        onChange={(next, picked) => {
          setValues(next);
          setOptions(picked);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Molecules/AsyncSearchableSelect',
  component: Picker,
  args: {
    id: ID,
    label: 'Item',
    path: PATH,
    params: { 'filter[active][eq]': '1' },
    rowSchema,
    toOption,
    value: [],
    selected: [],
    placeholder: 'Select item',
    searchPlaceholder: 'Search by name, SKU or barcode',
    noMatchText: (query: string) => `No items match “${query}”`,
    inactiveLabel: 'Inactive',
  },
  decorators: [withApi('serve')],
} satisfies Meta<typeof Picker>;

export default meta;
type Story = StoryObj<typeof meta>;

const open = async (canvasElement: HTMLElement): Promise<void> => {
  await userEvent.click(within(canvasElement).getByRole('combobox'));
};
const firstPage = async (name = /Sample item 25 /): Promise<void> => {
  await expect(await screen.findByRole('option', { name })).toBeInTheDocument();
};

/** Closed, nothing picked: "Select item" in muted text; nothing is requested until it opens. */
export const Idle: Story = {};

/** Open while the first page is on its way: three 36px skeleton rows, no "no match" text (D-39). */
export const Loading: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    await open(canvasElement);
    await expect(await screen.findByTestId('async-select-loading')).toBeInTheDocument();
  },
};

/** The search matched nothing: "No items match “zz”" once the answer is known. */
export const Empty: Story = {
  play: async ({ canvasElement }) => {
    await open(canvasElement);
    await firstPage();
    await userEvent.type(
      screen.getByPlaceholderText('Search by name, SKU or barcode'),
      'zz{Enter}',
    );
    await expect(await screen.findByText('No items match “zz”')).toBeInTheDocument();
  },
};

/** A retryable failure: the kit error with Retry inside the popover. */
export const Error: Story = {
  decorators: [withApi('fail')],
  play: async ({ canvasElement }) => {
    await open(canvasElement);
    await expect(await screen.findByTestId('async-select-error')).toBeInTheDocument();
  },
};

/** The first 25 rows, two lines each, and "Show more results" last. */
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    await open(canvasElement);
    await firstPage();
    await expect(screen.getByRole('option', { name: 'Show more results' })).toBeInTheDocument();
  },
};

/** Several picks: "2 selected" on the trigger and the chips under it, each with "Remove {label}". */
export const Multiple: Story = {
  args: {
    multiple: true,
    value: ['1', '2'],
    selected: [optionOf(1), optionOf(2)],
  },
};

/** "Show more results" loaded the next 25; the first new row is highlighted. */
export const ShowMore: Story = {
  play: async ({ canvasElement }) => {
    await open(canvasElement);
    await firstPage();
    await userEvent.click(screen.getByRole('option', { name: 'Show more results' }));
    await waitFor(async () => {
      await expect(screen.getByRole('option', { name: /Sample item 26 / })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  },
};

/** A scanner typed a barcode and Enter: that one row is picked and the popover closes. */
export const BarcodeEnter: Story = {
  args: { exactMatch },
  play: async ({ canvasElement }) => {
    await open(canvasElement);
    await firstPage();
    await userEvent.type(
      screen.getByPlaceholderText('Search by name, SKU or barcode'),
      '2000000000042{Enter}',
    );
    await waitFor(async () => {
      await expect(within(canvasElement).getByRole('combobox')).toHaveTextContent(
        'IT042 · Sample item 42',
      );
    });
  },
};

/** A picked item that has since become inactive keeps its label, with the "Inactive" badge. */
export const InactivePicked: Story = {
  args: { value: ['7'], selected: [optionOf(7)] },
};

/** 375px: the popover takes the trigger's width. */
export const Mobile: Story = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
  play: async ({ canvasElement }) => {
    await open(canvasElement);
    await firstPage();
  },
};

/** Arabic: the popover aligns to the inline start; codes and names keep their own direction. */
export const Rtl: Story = {
  args: {
    label: 'الصنف',
    placeholder: 'اختر صنفا',
    searchPlaceholder: 'ابحث بالاسم أو الرمز أو الباركود',
    noMatchText: (query: string) => `لا أصناف تطابق “${query}”`,
    inactiveLabel: 'غير نشط',
  },
  decorators: [withApi('serve', ROWS_AR)],
  globals: { locale: 'ar' },
  play: async ({ canvasElement }) => {
    await open(canvasElement);
    await firstPage(/صنف تجريبي 25 /);
  },
};
