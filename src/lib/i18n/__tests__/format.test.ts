// @vitest-environment happy-dom
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import {
  DEFAULT_FORMAT_SETTINGS,
  DEPLOYMENT_TIME_ZONE,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatSettingsSchema,
  useFormat,
  type FormatSettings,
} from '../format';

const AED: NonNullable<FormatSettings['currency']> = {
  code: 'AED',
  symbol: 'AED',
  placement: 'before',
  thousandSeparator: ',',
  decimalSeparator: '.',
};
const S = (over: Partial<FormatSettings> = {}): FormatSettings => ({
  ...DEFAULT_FORMAT_SETTINGS,
  ...over,
});
const MORNING = '2026-09-25T10:00:00Z';
const LATE_UTC = '2026-09-25T22:30:00Z';
const AFTERNOON_DUBAI = '2026-09-25T10:05:00Z';
/** 12:25:22 UTC is 16:25:22 in Asia/Dubai: a time with non-zero seconds. */
const WITH_SECONDS = '2026-07-22T12:25:22Z';
/** Arabic-Indic and extended Arabic-Indic digits: never rendered (D-34). */
const NON_LATIN_DIGIT = /[٠-٩۰-۹]/;

describe('DEFAULT_FORMAT_SETTINGS (the Perfex install defaults)', () => {
  it('is Y-m-d, 24h, "," and ".", 2 decimals, decimals kept, no zone, no currency', () => {
    expect(DEFAULT_FORMAT_SETTINGS).toEqual({
      dateFormat: 'Y-m-d',
      timeFormat: '24',
      thousandSeparator: ',',
      decimalSeparator: '.',
      decimalPlaces: 2,
      removeDecimalsOnZero: false,
      timeZone: null,
      currency: null,
    });
    expect(formatSettingsSchema.parse(DEFAULT_FORMAT_SETTINGS)).toEqual(DEFAULT_FORMAT_SETTINGS);
  });

  it('keeps Asia/Dubai as the time-zone fallback only (D-44)', () => {
    expect(DEPLOYMENT_TIME_ZONE).toBe('Asia/Dubai');
  });
});

describe('formatSettingsSchema (mirrors erp-api plan 02 `formats`)', () => {
  it('parses a full wire object as given', () => {
    const wire = S({ dateFormat: 'd-m-Y', timeZone: 'Asia/Dubai', currency: AED });
    expect(formatSettingsSchema.parse(wire)).toEqual(wire);
  });

  it('refuses a date format Perfex does not offer and a decimal places other than 2', () => {
    expect(formatSettingsSchema.safeParse({ ...S(), dateFormat: 'Y/m/d' }).success).toBe(false);
    expect(formatSettingsSchema.safeParse({ ...S(), decimalPlaces: 3 }).success).toBe(false);
  });
});

describe('formatDate', () => {
  it.each([
    ['d-m-Y', '25-09-2026'],
    ['m/d/Y', '09/25/2026'],
    ['Y-m-d', '2026-09-25'],
    ['d.m.Y', '25.09.2026'],
    ['d/m/Y', '25/09/2026'],
    ['m-d-Y', '09-25-2026'],
    ['m.d.Y', '09.25.2026'],
  ] as const)('%s renders %s', (dateFormat, expected) => {
    expect(formatDate(S({ dateFormat }), MORNING)).toBe(expected);
  });

  it("applies the customer's zone: 22:30 UTC is the next day in Asia/Dubai", () => {
    expect(formatDate(S({ dateFormat: 'd-m-Y', timeZone: 'Asia/Dubai' }), LATE_UTC)).toBe(
      '26-09-2026',
    );
    expect(formatDate(S({ dateFormat: 'd-m-Y', timeZone: 'UTC' }), LATE_UTC)).toBe('25-09-2026');
  });

  it('falls back to Asia/Dubai when the zone is null', () => {
    expect(formatDate(S({ dateFormat: 'd-m-Y', timeZone: null }), LATE_UTC)).toBe('26-09-2026');
  });

  it('takes a Date as well as an ISO string', () => {
    expect(formatDate(S(), new Date(MORNING))).toBe('2026-09-25');
  });
});

describe('formatDateTime', () => {
  it('renders the date, one space and HH:mm:ss in 24-hour time (Perfex _dt() H:i:s)', () => {
    expect(formatDateTime(S({ dateFormat: 'd-m-Y', timeFormat: '24' }), AFTERNOON_DUBAI)).toBe(
      '25-09-2026 14:05:00',
    );
    expect(formatDateTime(S({ dateFormat: 'd-m-Y', timeFormat: '24' }), WITH_SECONDS)).toBe(
      '22-07-2026 16:25:22',
    );
  });

  it('renders h:mm AM|PM in 12-hour time, no seconds (Perfex _dt() g:i A)', () => {
    expect(formatDateTime(S({ dateFormat: 'd-m-Y', timeFormat: '12' }), AFTERNOON_DUBAI)).toBe(
      '25-09-2026 2:05 PM',
    );
    expect(formatDateTime(S({ dateFormat: 'd-m-Y', timeFormat: '12' }), WITH_SECONDS)).toBe(
      '22-07-2026 4:25 PM',
    );
  });
});

describe('formatNumber', () => {
  it('groups by 3 with no decimals by default', () => {
    expect(formatNumber(S(), 1240)).toBe('1,240');
  });

  it("uses the customer's separators", () => {
    expect(formatNumber(S({ thousandSeparator: '.', decimalSeparator: ',' }), 1240)).toBe('1.240');
    expect(formatNumber(S({ thousandSeparator: '.', decimalSeparator: ',' }), 1234567.891, 2)).toBe(
      '1.234.567,89',
    );
  });

  it('renders the asked decimals and a minus', () => {
    expect(formatNumber(S(), 1234567.891, 2)).toBe('1,234,567.89');
    expect(formatNumber(S(), -5)).toBe('-5');
  });
});

describe('formatMoney', () => {
  it('puts the symbol before with NO space and 2 decimals (D-44)', () => {
    expect(formatMoney(S({ currency: AED }), 1240)).toBe('AED1,240.00');
  });

  it('puts the minus before the symbol', () => {
    expect(formatMoney(S({ currency: AED }), -1240)).toBe('-AED1,240.00');
  });

  it('puts the symbol after when the currency says so', () => {
    expect(formatMoney(S({ currency: { ...AED, placement: 'after' } }), 1240)).toBe('1,240.00AED');
  });

  it('honours remove_decimals_on_zero on whole amounts only', () => {
    const s = S({ currency: AED, removeDecimalsOnZero: true });
    expect(formatMoney(s, 1240)).toBe('AED1,240');
    expect(formatMoney(s, 1240.5)).toBe('AED1,240.50');
  });

  it('renders a plain 2-decimal number when there is no currency', () => {
    expect(formatMoney(S(), 1240)).toBe('1,240.00');
  });

  it("uses the currency's own separators over the option-level ones", () => {
    const s = S({
      thousandSeparator: ',',
      decimalSeparator: '.',
      currency: { ...AED, thousandSeparator: '.', decimalSeparator: ',' },
    });
    expect(formatMoney(s, 1240)).toBe('AED1.240,00');
  });

  it("without the symbol (opt-in, Perfex's app_format_money(x, '')): the currency's number only", () => {
    const s = S({ currency: { ...AED, thousandSeparator: '.', decimalSeparator: ',' } });
    expect(formatMoney(s, -1240, { symbol: false })).toBe('-1.240,00');
    expect(formatMoney(S(), 1240, { symbol: false })).toBe('1,240.00');
    expect(formatMoney(s, 1240, { symbol: true })).toBe('AED1.240,00');
  });
});

function Probe(): React.JSX.Element {
  const f = useFormat();
  return createElement(
    'div',
    null,
    createElement('span', { 'data-testid': 'date' }, f.date(MORNING)),
    createElement('span', { 'data-testid': 'date-time' }, f.dateTime(AFTERNOON_DUBAI)),
    createElement('span', { 'data-testid': 'number' }, f.number(1234567.891, 2)),
    createElement('span', { 'data-testid': 'money' }, f.money(-1240)),
    createElement('span', { 'data-testid': 'list' }, f.list(['a', 'b'])),
  );
}

describe('useFormat (the client door)', () => {
  it('uses DEFAULT_FORMAT_SETTINGS outside a FormatSettingsProvider', () => {
    renderWithProviders(createElement(Probe));
    expect(screen.getByTestId('date').textContent).toBe('2026-09-25');
    expect(screen.getByTestId('date-time').textContent).toBe('2026-09-25 14:05:00');
    expect(screen.getByTestId('money').textContent).toBe('-1,240.00');
    expect(screen.getByTestId('list').textContent).toBe('a and b');
  });

  it('renders Western digits only under ar: the locale changes the words, never the format (D-33, D-34)', () => {
    renderWithProviders(createElement(Probe), { locale: 'ar' });
    for (const id of ['date', 'date-time', 'number', 'money']) {
      const text = screen.getByTestId(id).textContent;
      expect(text, id).not.toMatch(NON_LATIN_DIGIT);
      expect(text, id).toMatch(/[0-9]/);
    }
    expect(screen.getByTestId('number').textContent).toBe('1,234,567.89');
  });
});
