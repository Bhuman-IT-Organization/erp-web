// @vitest-environment happy-dom
import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useState, type ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import commonEn from '@/messages/common/en.json';
import { problem } from '@/test/axios-fakes';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import {
  ASYNC_PAGE_SIZE,
  AsyncSearchableSelect,
  type AsyncOption,
  type AsyncSearchableSelectProps,
} from '../AsyncSearchableSelect';

/**
 * K7 over a fake keyset list (UI-SPEC § Item picker). The adapter serves 60 synthetic rows,
 * "Sample item 1" to "Sample item 60" with SKU `SKU-0001`... and barcode `20000000000NN`, filtered
 * by `q` (name, SKU or barcode) and paged by an offset cursor; every request is recorded.
 */
const COMMON = commonEn.common;
const ID = 'item';
const LABEL = 'Item';
const PATH = '/api/v1/demo/items';
const PLACEHOLDER = 'Select item';
const SEARCH = 'Search by name, SKU or barcode';
const INACTIVE = 'Inactive';
const noMatchText = (query: string) => `No items match “${query}”`;

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
const ROWS: readonly Row[] = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  code: `IT${pad(i + 1, 3)}`,
  name: `Sample item ${String(i + 1)}`,
  sku: `SKU-${pad(i + 1, 4)}`,
  barcode: `20000000000${pad(i + 1, 2)}`,
  active: i !== 6,
}));

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
const exactMatch = (query: string, rows: readonly Row[]) => {
  const hits = rows.filter((r) => r.barcode === query);
  return hits.length === 1 ? hits[0] : undefined;
};

type Mode = 'serve' | 'pending' | 'fail-then-serve';
const urls: string[] = [];
/** When each request left (`Date.now()`), index for index with `urls`. */
const stamps: number[] = [];

function api(mode: Mode): AxiosAdapter {
  let failed = false;
  return (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? '';
    urls.push(url);
    stamps.push(Date.now());
    if (mode === 'pending') return new Promise<never>(() => undefined);
    const query = new URL(url, 'http://x').searchParams;
    const respond = (status: number, data: unknown) => {
      const response = { data, status, statusText: '', headers: new AxiosHeaders(), config };
      return status < 300
        ? Promise.resolve(response)
        : Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
    };
    if (mode === 'fail-then-serve' && !failed) {
      failed = true;
      return respond(503, problem(503, 'ERP-UPSTREAM-0001'));
    }
    const q = (query.get('q') ?? '').toLowerCase();
    const hits = ROWS.filter(
      (r) => q === '' || `${r.name} ${r.sku} ${r.barcode}`.toLowerCase().includes(q),
    );
    const from = Number(query.get('cursor') ?? '0');
    const limit = Number(query.get('limit'));
    const next = from + limit < hits.length ? String(from + limit) : null;
    return respond(200, {
      data: hits.slice(from, from + limit),
      meta: { nextCursor: next, prevCursor: null },
    });
  };
}

type HostProps = Partial<AsyncSearchableSelectProps<Row>> & {
  readonly spy?: (values: string[], options: readonly AsyncOption[]) => void;
  readonly initial?: readonly string[];
  readonly initialSelected?: readonly AsyncOption[];
};

/** A controlled host, as a form's Controller is: onChange writes the values and their labels back. */
function Host({ spy, initial = [], initialSelected = [], ...rest }: HostProps): ReactElement {
  const [value, setValue] = useState<readonly string[]>(initial);
  const [selected, setSelected] = useState<readonly AsyncOption[]>(initialSelected);
  return (
    <>
      <label htmlFor={ID}>{LABEL}</label>
      <AsyncSearchableSelect<Row>
        id={ID}
        path={PATH}
        params={{ 'filter[active][eq]': '1' }}
        rowSchema={rowSchema}
        toOption={toOption}
        placeholder={PLACEHOLDER}
        searchPlaceholder={SEARCH}
        noMatchText={noMatchText}
        inactiveLabel={INACTIVE}
        {...rest}
        value={value}
        selected={selected}
        onChange={(values, options) => {
          spy?.(values, options);
          setValue(values);
          setSelected(options);
        }}
      />
    </>
  );
}

function renderHost(props: HostProps = {}, mode: Mode = 'serve', locale: 'en' | 'ar' = 'en') {
  http.defaults.adapter = api(mode);
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <Host {...props} />
    </SWRConfig>,
    { locale },
  );
}

const trigger = () => screen.getByRole('combobox', { name: LABEL });
const box = () => screen.getByPlaceholderText<HTMLInputElement>(SEARCH);
const optionNames = () =>
  within(screen.getByRole('listbox'))
    .queryAllByRole('option')
    .map((o) => o.getAttribute('data-value'));
/** The option of "Sample item {n}" (its accessible name is the label, a space, then the meta). */
const row = (n: number) =>
  screen.getByRole('option', { name: new RegExp(`Sample item ${String(n)} SKU`) });
const loaded = async (count: number) => {
  await waitFor(() => {
    expect(screen.getAllByRole('option', { name: /Sample item/ })).toHaveLength(count);
  });
};

describe('AsyncSearchableSelect (K7)', () => {
  beforeEach(() => {
    urls.length = 0;
    stamps.length = 0;
    setSession({ accessToken: 'at', csrfToken: 'ct' });
  });
  afterEach(() => {
    delete http.defaults.adapter;
    clearSession();
  });

  it('Idle: the 32px trigger reads the placeholder in muted text and nothing is requested before it opens', () => {
    renderHost();
    expect(trigger().textContent).toContain(PLACEHOLDER);
    expect(trigger().querySelector('.text-muted-foreground')?.textContent).toBe(PLACEHOLDER);
    expect(trigger().className.split(' ')).toContain('h-8');
    expect(urls).toEqual([]);
  });

  it('Loading: opening asks the first page (25, the fixed params, no q) and shows three 36px skeleton rows and no empty text', async () => {
    renderHost({}, 'pending');
    await userEvent.click(trigger());
    expect(urls).toEqual([`${PATH}?filter%5Bactive%5D%5Beq%5D=1&limit=${String(ASYNC_PAGE_SIZE)}`]);
    const skeleton = screen.getByTestId('async-select-loading');
    expect(skeleton.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
    for (const bar of skeleton.querySelectorAll('[data-slot="skeleton"]')) {
      expect(bar.className.split(' ')).toContain('h-9');
    }
    expect(screen.queryByText(noMatchText(''))).toBeNull();
    expect(screen.queryByText(COMMON.no_matches)).toBeNull();
  });

  it('Loaded: each option has two lines (label, 12px muted meta) and the picked one is checked', async () => {
    renderHost({ initial: ['2'], initialSelected: [optionOf(2)] });
    await userEvent.click(trigger());
    await loaded(ASYNC_PAGE_SIZE);
    const second = screen.getByRole('option', { name: /IT002 · Sample item 2/ });
    expect(second.textContent).toContain('SKU SKU-0002');
    expect(within(second).getByText('SKU SKU-0002').className.split(' ')).toEqual(
      expect.arrayContaining(['text-xs', 'text-muted-foreground']),
    );
    expect(second.getAttribute('aria-checked')).toBe('true');
    expect(
      screen.getAllByRole('option').filter((o) => o.getAttribute('aria-checked') === 'true'),
    ).toHaveLength(1);
  });

  it('picking (single) calls onChange with the value and its option, closes, and shows the label with its code in <bdi>', async () => {
    const spy = vi.fn();
    renderHost({ spy });
    await userEvent.click(trigger());
    await loaded(ASYNC_PAGE_SIZE);
    await userEvent.click(row(3));
    expect(spy).toHaveBeenCalledWith(['3'], [optionOf(3)]);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger().querySelector('bdi')?.textContent).toBe('IT003 · Sample item 3');
  });

  it('typing asks the server only once the text has settled for 300 ms', async () => {
    renderHost();
    await userEvent.click(trigger());
    await loaded(ASYNC_PAGE_SIZE);
    // The clock starts at the last keystroke the box received, not when the typing helper returns.
    let lastKeyAt = 0;
    box().addEventListener('input', () => {
      lastKeyAt = Date.now();
    });
    await userEvent.type(box(), 'item 4');
    expect(urls.some((u) => u.includes('q='))).toBe(false);
    await waitFor(() => {
      expect(urls.at(-1)).toContain('q=item%204');
    });
    const askedAt = stamps.at(-1) ?? 0;
    // 1 ms of slack for Date.now() rounding at both ends.
    expect(askedAt - lastKeyAt).toBeGreaterThanOrEqual(CLIENT_TIMINGS.list.searchDebounceMs - 1);
    expect(urls.filter((u) => u.includes('q='))).toEqual([
      `${PATH}?filter%5Bactive%5D%5Beq%5D=1&limit=25&q=item%204`,
    ]);
  });

  it('Enter settles the typed text at once (no wait for the settle)', async () => {
    renderHost();
    await userEvent.click(trigger());
    await loaded(ASYNC_PAGE_SIZE);
    await userEvent.type(box(), 'item 5{Enter}');
    expect(urls.at(-1)).toContain('q=item%205');
  });

  it('Empty: "No items match “zz”" once the answer is empty', async () => {
    renderHost();
    await userEvent.click(trigger());
    await loaded(ASYNC_PAGE_SIZE);
    await userEvent.type(box(), 'zz{Enter}');
    expect(await screen.findByText(noMatchText('zz'))).toBeTruthy();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('Error: the kit error with Retry inside the popover; Retry asks again and shows the rows', async () => {
    renderHost({}, 'fail-then-serve');
    await userEvent.click(trigger());
    const error = await screen.findByTestId('async-select-error');
    expect(error.textContent).toContain(
      commonEn.common.errors['ERP-UPSTREAM-0001'].split(' Try again')[0],
    );
    expect(screen.queryByText(noMatchText(''))).toBeNull();
    await userEvent.click(within(error).getByRole('button', { name: COMMON.retry }));
    await loaded(ASYNC_PAGE_SIZE);
    expect(screen.queryByTestId('async-select-error')).toBeNull();
  });

  it('ShowMore: "Show more results" is the last option, loads the next cursor and highlights the first new row', async () => {
    renderHost();
    await userEvent.click(trigger());
    await loaded(ASYNC_PAGE_SIZE);
    const more = screen.getByRole('option', { name: COMMON.show_more_results });
    expect(optionNames().at(-1)).toBe(more.getAttribute('data-value'));
    await userEvent.keyboard('{End}{Enter}');
    await loaded(50);
    expect(urls.at(-1)).toContain('cursor=25');
    await waitFor(() => {
      expect(row(26).getAttribute('aria-selected')).toBe('true');
    });
    await userEvent.click(screen.getByRole('option', { name: COMMON.show_more_results }));
    await loaded(60);
    expect(screen.queryByRole('option', { name: COMMON.show_more_results })).toBeNull();
  });

  it('BarcodeEnter: the exact scan code then Enter picks that row and closes (single)', async () => {
    const spy = vi.fn();
    renderHost({ spy, exactMatch });
    await userEvent.click(trigger());
    await loaded(ASYNC_PAGE_SIZE);
    await userEvent.type(box(), '2000000000042{Enter}');
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(['42'], [optionOf(42)]);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });

  it('BarcodeEnter (multiple): the scan adds the row, keeps the popover open and clears the box', async () => {
    const spy = vi.fn();
    renderHost({ spy, exactMatch, multiple: true });
    await userEvent.click(trigger());
    await loaded(ASYNC_PAGE_SIZE);
    await userEvent.type(box(), '2000000000042{Enter}');
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(['42'], [optionOf(42)]);
    });
    expect(box().value).toBe('');
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('Multiple: picking two keeps the popover open; the trigger reads "2 selected" and chips can remove one', async () => {
    const spy = vi.fn();
    renderHost({ spy, multiple: true });
    await userEvent.click(trigger());
    await loaded(ASYNC_PAGE_SIZE);
    await userEvent.click(row(1));
    await userEvent.click(row(2));
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(spy).toHaveBeenLastCalledWith(['1', '2'], [optionOf(1), optionOf(2)]);
    expect(trigger().textContent).toContain(COMMON.selected_count.replace('{count}', '2'));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      screen.getByRole('button', {
        name: COMMON.remove_item.replace('{label}', 'IT001 · Sample item 1'),
      }),
    );
    expect(spy).toHaveBeenLastCalledWith(['2'], [optionOf(2)]);
  });

  it('Multiple with showChips={false}: no chip list', () => {
    renderHost({
      multiple: true,
      showChips: false,
      initial: ['1'],
      initialSelected: [optionOf(1)],
    });
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('keyboard: the arrow keys move, Esc closes and returns focus to the trigger', async () => {
    renderHost();
    await userEvent.click(trigger());
    await loaded(ASYNC_PAGE_SIZE);
    await userEvent.keyboard('{ArrowDown}');
    expect(row(2).getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('InactivePicked: a picked inactive option shows on the trigger with the "Inactive" badge', () => {
    renderHost({ initial: ['7'], initialSelected: [optionOf(7)] });
    expect(trigger().querySelector('bdi')?.textContent).toBe('IT007 · Sample item 7');
    expect(within(trigger()).getByText(INACTIVE)).toBeTruthy();
  });

  it('Mobile: the popover takes the trigger width, and at least 384px from md', async () => {
    renderHost();
    await userEvent.click(trigger());
    const content = screen.getByRole('dialog');
    expect(content.className.split(' ')).toEqual(
      expect.arrayContaining(['w-(--radix-popover-trigger-width)', 'md:min-w-96']),
    );
  });

  it('Rtl: no physical-direction class under ar, closed or open with rows', async () => {
    const { container } = renderHost(
      { initial: ['7'], initialSelected: [optionOf(7)] },
      'serve',
      'ar',
    );
    expect(physicalClassesIn(container)).toEqual([]);
    await userEvent.click(trigger());
    await loaded(ASYNC_PAGE_SIZE);
    expect(physicalClassesIn(document.body)).toEqual([]);
  });
});
