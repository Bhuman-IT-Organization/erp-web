import { useFormatter } from 'next-intl';
import { z } from 'zod';
import { useFormatSettings } from './FormatSettingsProvider';

/**
 * The client door for every date, time, number and currency string (FE-26): `Intl.*` and
 * `toLocale*String` are lint errors everywhere else (eslint.config.mjs `S_INTL`; this file and
 * `format.server.ts` are the S22 exemption).
 *
 * Formats follow the customer's Perfex settings (D-33), served as `branding.formats` and provided
 * once by `app/layout.tsx` through `FormatSettingsProvider`: **the locale changes the words, never
 * the format**. Exactly as Perfex renders them (D-44): no space between the currency symbol and the
 * amount, 2 decimals (`remove_decimals_on_zero` drops them on a whole amount), the customer's own
 * `default_timezone`. Digits are always Western 0-9, whatever the locale (D-34), so amounts, codes
 * and dates stay copy-pasteable and match the CSV export.
 */

/**
 * The fallback time zone when Perfex's `default_timezone` is absent or invalid (`formats.timeZone`
 * is `null`) — no longer the zone itself (D-44).
 */
export const DEPLOYMENT_TIME_ZONE = 'Asia/Dubai';

/**
 * Lead decision 2026-09-20: Latin digits under every locale, the Gregorian calendar, and the
 * fallback zone. Every `Intl` call in the two doors starts from these.
 */
export const FORMAT_DEFAULTS = Object.freeze({
  numberingSystem: 'latn',
  calendar: 'gregory',
  timeZone: DEPLOYMENT_TIME_ZONE,
});

/** Perfex `get_available_date_formats()`: made of `d`, `m`, `Y` and one separator. */
const PERFEX_DATE_FORMATS = [
  'd-m-Y',
  'd/m/Y',
  'm-d-Y',
  'm.d.Y',
  'm/d/Y',
  'Y-m-d',
  'd.m.Y',
] as const;

/** `formatMoney`'s opt-ins; `symbol: false` drops the currency symbol (default: shown). */
export interface MoneyOptions {
  readonly symbol?: boolean;
}

export interface CurrencyFormat {
  readonly code: string;
  readonly symbol: string;
  readonly placement: 'before' | 'after';
  readonly thousandSeparator: string;
  readonly decimalSeparator: string;
}

export interface FormatSettings {
  readonly dateFormat: (typeof PERFEX_DATE_FORMATS)[number];
  readonly timeFormat: '24' | '12';
  readonly thousandSeparator: string;
  readonly decimalSeparator: string;
  readonly decimalPlaces: 2;
  readonly removeDecimalsOnZero: boolean;
  readonly timeZone: string | null;
  readonly currency: CurrencyFormat | null;
}

/** erp-api caps a currency symbol at 10 characters (plan 03.2-02: `tblcurrencies.symbol`, trimmed). */
const CURRENCY_SYMBOL_MAX = 10;

/** Mirrors erp-api `brandingResponseSchema.formats` (plan 03.2-02) field for field. */
export const formatSettingsSchema: z.ZodType<FormatSettings> = z.object({
  dateFormat: z.enum(PERFEX_DATE_FORMATS),
  timeFormat: z.enum(['24', '12']),
  thousandSeparator: z.string().max(1),
  decimalSeparator: z.string().length(1),
  decimalPlaces: z.literal(2),
  removeDecimalsOnZero: z.boolean(),
  timeZone: z.string().nullable(),
  currency: z
    .object({
      code: z.string().regex(/^[A-Z]{3}$/),
      symbol: z.string().min(1).max(CURRENCY_SYMBOL_MAX),
      placement: z.enum(['before', 'after']),
      thousandSeparator: z.string().max(1),
      decimalSeparator: z.string().length(1),
    })
    .nullable(),
});

/** The Perfex install defaults: what renders until (or unless) the api serves `formats`. */
export const DEFAULT_FORMAT_SETTINGS: FormatSettings = Object.freeze({
  dateFormat: 'Y-m-d',
  timeFormat: '24',
  thousandSeparator: ',',
  decimalSeparator: '.',
  decimalPlaces: 2,
  removeDecimalsOnZero: false,
  timeZone: null,
  currency: null,
});

type DatePart = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'dayPeriod';

function dateParts(s: FormatSettings, value: Date | string): (type: DatePart) => string {
  const parts = new Intl.DateTimeFormat('en', {
    ...FORMAT_DEFAULTS,
    timeZone: s.timeZone ?? DEPLOYMENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: s.timeFormat === '24' ? '2-digit' : 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: s.timeFormat === '24' ? 'h23' : 'h12',
  }).formatToParts(typeof value === 'string' ? new Date(value) : value);
  return (type) => parts.find((p) => p.type === type)?.value ?? '';
}

/** Perfex `_d()`: the date in the customer's `dateformat`, e.g. `d-m-Y` → `25-09-2026`. */
export function formatDate(s: FormatSettings, value: Date | string): string {
  const part = dateParts(s, value);
  const token = { d: part('day'), m: part('month'), Y: part('year') };
  return s.dateFormat.replaceAll(/[dmY]/g, (t) => token[t as keyof typeof token]);
}

/**
 * Perfex `_dt()`: the date, one space, then `H:i:s` (24, `HH:mm:ss`) or `g:i A` (12, `h:mm AM|PM`,
 * no seconds).
 */
export function formatDateTime(s: FormatSettings, value: Date | string): string {
  const part = dateParts(s, value);
  const time =
    s.timeFormat === '24'
      ? `${part('hour')}:${part('minute')}:${part('second')}`
      : `${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
  return `${formatDate(s, value)} ${time}`;
}

/** `1234.5` → `1,234.50` with the given separators; the minus only when a non-zero digit shows. */
function grouped(value: number, decimals: number, thousand: string, decimal: string): string {
  const [whole = '0', fraction] = Math.abs(value).toFixed(decimals).split('.');
  // ponytail: toFixed switches to exponent notation above 1e21; no ERP amount gets there.
  const body = whole.replaceAll(/\B(?=(\d{3})+(?!\d))/g, thousand);
  const sign = value < 0 && /[1-9]/.test(whole + (fraction ?? '')) ? '-' : '';
  return `${sign}${body}${fraction === undefined ? '' : `${decimal}${fraction}`}`;
}

/** A number with the customer's separators, grouped by 3; `decimals` defaults to 0. */
export function formatNumber(s: FormatSettings, value: number, decimals = 0): string {
  return grouped(value, decimals, s.thousandSeparator, s.decimalSeparator);
}

/**
 * Perfex `app_format_money`: the base currency's symbol before or after the amount with NO space,
 * the currency's own separators, 2 decimals (0 on a whole amount when `removeDecimalsOnZero`),
 * and the minus before the symbol (`-AED1,240.00`). No currency → the number with 2 decimals.
 * `{ symbol: false }` (opt-in, 4.7 plan 12) is Perfex's `app_format_money($x, '')`: the same number
 * without the symbol.
 */
export function formatMoney(s: FormatSettings, amount: number, options: MoneyOptions = {}): string {
  const decimals = s.removeDecimalsOnZero && Number.isInteger(amount) ? 0 : s.decimalPlaces;
  const { currency } = s;
  if (currency === null) return formatNumber(s, amount, decimals);
  const number = grouped(
    Math.abs(amount),
    decimals,
    currency.thousandSeparator,
    currency.decimalSeparator,
  );
  const sign = amount < 0 && /[1-9]/.test(number) ? '-' : '';
  if (options.symbol === false) return `${sign}${number}`;
  return currency.placement === 'before'
    ? `${sign}${currency.symbol}${number}`
    : `${sign}${number}${currency.symbol}`;
}

type Formatter = ReturnType<typeof useFormatter>;

export interface Format {
  /** `formatDate` in the customer's format. */
  readonly date: (value: Date | string) => string;
  /** `formatDateTime` in the customer's format and zone. */
  readonly dateTime: (value: Date | string) => string;
  /** `formatNumber` with the customer's separators. */
  readonly number: (value: number, decimals?: number) => string;
  /** `formatMoney` in the customer's base currency (`{ symbol: false }`: the number only). */
  readonly money: (amount: number, options?: MoneyOptions) => string;
  /** next-intl's relative time ("3 minutes ago"), unchanged. */
  readonly relativeTime: Formatter['relativeTime'];
  /** next-intl's list formatting ("a, b and c"), unchanged. */
  readonly list: Formatter['list'];
}

/** The door over one settings object; shared by the client and server doors. */
export function formatWith(s: FormatSettings, formatter: Formatter): Format {
  return {
    date: (value) => formatDate(s, value),
    dateTime: (value) => formatDateTime(s, value),
    number: (value, decimals) => formatNumber(s, value, decimals),
    money: (amount, options) => formatMoney(s, amount, options),
    relativeTime: formatter.relativeTime,
    list: formatter.list,
  };
}

/** The client door: `const f = useFormat(); f.date(row.createdAt); f.money(row.total)`. */
export function useFormat(): Format {
  return formatWith(useFormatSettings(), useFormatter());
}
