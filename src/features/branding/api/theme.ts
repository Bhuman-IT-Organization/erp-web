/**
 * The customer's theme as `:root` token values (SC-6, W0-05). `branding.theme` is a free
 * `Record<string, string>` from the api (legacy `tbloptions` today, the settings module later);
 * this file is the only way a value from it reaches a stylesheet, and it lets through ONLY an
 * allowlisted token name with a value that matches a narrow grammar (T-3-11: CSS injection).
 * Pure: no React, no server import; `app/layout.tsx` renders the result as the text child of a
 * `<style>` element (never `dangerouslySetInnerHTML`).
 *
 * The brand contract (03.2 UI-SPEC § Brand contract):
 * - Only a FILL carries the brand (UI-SPEC choice 8): a customer's colour may be light (yellow,
 *   sky blue) and would fail AA as text, so it feeds `--primary` and its `--sidebar-primary` alias
 *   and nothing else.
 * - The foreground on that fill is COMPUTED here, never taken from the api (D-08): white when its
 *   WCAG 2.x contrast with the brand is at least 4.5:1, black otherwise. Pure white and pure black
 *   cross over at 4.58:1, so the winner always passes AA.
 * - Meanings are FIXED (D-06): destructive, success, ring, border and input are not brandable, so
 *   a brand can never make Save look like Delete, nor hide the focus ring.
 */

/**
 * The only brandable inputs: `--<name>` custom properties declared on `:root` in
 * `app/globals.css`. `api/__tests__/theme.test.ts` asserts they are a subset of `:root` and share
 * nothing with `FIXED_MEANING_TOKENS`.
 */
export const THEME_TOKENS = ['primary', 'radius'] as const;

/** Tokens a theme can never set: fixed meanings (D-06) and the computed foregrounds (D-08). */
export const FIXED_MEANING_TOKENS = [
  'destructive',
  'success',
  'ring',
  'border',
  'input',
  'primary-foreground',
  'sidebar-primary-foreground',
] as const;

/** A colour or length: `oklch(0.5 0.1 250)`, `#0a7cff`, `0.5rem`, `1 0 0 / 10%`. No `;` `}` `<` `>` `"` `'` newline, at most 64 characters. */
export const THEME_VALUE = /^[a-z0-9 .%()/,#-]{1,64}$/;

/** Checked AFTER `THEME_VALUE`: the character class admits `url(//x/y)` and a comment opener. */
export const THEME_VALUE_REJECT = /url\(|expression\(|@import|\/\*|\\/i;

export function isSafeThemeValue(value: string): boolean {
  return THEME_VALUE.test(value) && !THEME_VALUE_REJECT.test(value);
}

type Rgb = readonly [number, number, number];

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const OKLCH_COLOUR = /^oklch\((\d*\.?\d+)(%?) (\d*\.?\d+) (-?\d*\.?\d+)\)$/;
const WHITE = 'oklch(1 0 0)';
const BLACK = 'oklch(0 0 0)';

/* eslint-disable @typescript-eslint/no-magic-numbers -- the literals below are the published definitions: hex digit widths, the OKLab → linear sRGB matrices (Björn Ottosson) and the sRGB / WCAG 2.x transfer and luminance constants */
const clamp01 = (c: number): number => Math.min(1, Math.max(0, c));

function parseHex(value: string): Rgb {
  const digits = value.slice(1);
  const full = digits.length === 3 ? digits.replaceAll(/./g, '$&$&') : digits;
  const channel = (i: number): number => Number.parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
  return [channel(0), channel(1), channel(2)];
}

function oklchToSrgb(lightness: number, chroma: number, hueDeg: number): Rgb {
  const hue = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear: Rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const encode = (c: number): number =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return [
    clamp01(encode(clamp01(linear[0]))),
    clamp01(encode(clamp01(linear[1]))),
    clamp01(encode(clamp01(linear[2]))),
  ];
}

/** WCAG 2.x relative luminance of an sRGB colour (0..1 channels). */
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * The brand colour as sRGB 0..1, or `null` when it is not `#rgb`, `#rrggbb` or `oklch(L C H)`
 * (L 0..1 or 0%..100%, C ≥ 0, H in degrees). Anything else is dropped (fail closed): the neutral
 * default in `globals.css` stays.
 */
export function parseBrandColour(value: string): Rgb | null {
  if (HEX_COLOUR.test(value)) return parseHex(value);
  const match = OKLCH_COLOUR.exec(value);
  if (match === null) return null;
  const [, l = '', percent, c = '', h = ''] = match;
  const lightness = percent === '%' ? Number(l) / 100 : Number(l);
  if (lightness > 1) return null;
  return oklchToSrgb(lightness, Number(c), Number(h));
}

/** White when its WCAG 2.x contrast with the brand (`1.05 / (Y + 0.05)`) is at least 4.5:1, else black. */
export function contrastForeground(rgb: Rgb): typeof WHITE | typeof BLACK {
  return 1.05 / (luminance(rgb) + 0.05) >= 4.5 ? WHITE : BLACK;
}
/* eslint-enable @typescript-eslint/no-magic-numbers -- the colour constants end here */

/**
 * `:root{--primary:<v>;--sidebar-primary:<v>;--primary-foreground:<fg>;--sidebar-primary-foreground:<fg>;--radius:<r>}`
 * — `primary` only when it is safe AND parses (its foreground computed), `radius` only when safe;
 * every other key, including any `*-foreground` the api sends, is ignored. `null` when nothing
 * survives (the layout renders no `<style>` then, and the page keeps the `globals.css` defaults).
 */
export function themeCss(theme: Readonly<Record<string, string>>): string | null {
  const declarations: string[] = [];
  const primary = theme.primary;
  const rgb = primary !== undefined && isSafeThemeValue(primary) ? parseBrandColour(primary) : null;
  if (primary !== undefined && rgb !== null) {
    const foreground = contrastForeground(rgb);
    declarations.push(
      `--primary:${primary}`,
      `--sidebar-primary:${primary}`,
      `--primary-foreground:${foreground}`,
      `--sidebar-primary-foreground:${foreground}`,
    );
  }
  const radius = theme.radius;
  if (radius !== undefined && isSafeThemeValue(radius)) declarations.push(`--radius:${radius}`);
  return declarations.length === 0 ? null : `:root{${declarations.join(';')}}`;
}
