import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  contrastForeground,
  FIXED_MEANING_TOKENS,
  isSafeThemeValue,
  parseBrandColour,
  THEME_TOKENS,
  THEME_VALUE,
  THEME_VALUE_REJECT,
  themeCss,
} from '../theme';

const GLOBALS_CSS = readFileSync(
  fileURLToPath(new URL('../../../../../app/globals.css', import.meta.url)),
  'utf8',
);

/** The `--<name>:` declarations inside the first `<selector> { … }` block of globals.css. */
function tokensIn(selector: RegExp): string[] {
  const block = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(GLOBALS_CSS)?.[1] ?? '';
  return [...block.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1] ?? '');
}
const rootTokensInGlobalsCss = (): string[] => tokensIn(/:root/);
const themeInlineTokensInGlobalsCss = (): string[] => tokensIn(/@theme inline/);

const WHITE = 'oklch(1 0 0)';
const BLACK = 'oklch(0 0 0)';

describe('THEME_TOKENS', () => {
  it('is exactly primary and radius, the only brandable inputs (D-06)', () => {
    expect([...THEME_TOKENS]).toEqual(['primary', 'radius']);
  });

  it('is a subset of the :root declarations (nothing from @theme inline)', () => {
    const declared = rootTokensInGlobalsCss();
    for (const token of THEME_TOKENS) expect(declared).toContain(token);
    expect(THEME_TOKENS).not.toContain('color-primary');
    expect(THEME_TOKENS).not.toContain('radius-lg');
  });

  it('contains none of the fixed-meaning tokens: a brand can never make Save look like Delete (D-06)', () => {
    expect([...FIXED_MEANING_TOKENS]).toEqual([
      'destructive',
      'success',
      'ring',
      'border',
      'input',
      'primary-foreground',
      'sidebar-primary-foreground',
    ]);
    for (const token of FIXED_MEANING_TOKENS) expect(THEME_TOKENS).not.toContain(token);
  });
});

describe('app/globals.css', () => {
  it('declares the fixed --success pair on :root and --color-success in @theme inline (bg-success)', () => {
    expect(rootTokensInGlobalsCss()).toEqual(
      expect.arrayContaining(['success', 'success-foreground']),
    );
    expect(themeInlineTokensInGlobalsCss()).toEqual(
      expect.arrayContaining(['color-success', 'color-success-foreground']),
    );
  });
});

describe('parseBrandColour', () => {
  it('parses #rgb and #rrggbb to sRGB 0..1', () => {
    expect(parseBrandColour('#000')).toEqual([0, 0, 0]);
    const [r, g, b] = parseBrandColour('#1d4ed8') ?? [];
    expect(r).toBeCloseTo(0.114, 3);
    expect(g).toBeCloseTo(0.306, 3);
    expect(b).toBeCloseTo(0.847, 3);
  });

  it('parses oklch(L C H) with L as a fraction to a near-black grey', () => {
    const rgb = parseBrandColour('oklch(0.205 0 0)');
    expect(rgb).not.toBeNull();
    for (const channel of rgb ?? []) {
      expect(channel).toBeGreaterThan(0.05);
      expect(channel).toBeLessThan(0.15);
    }
    expect(rgb?.[0]).toBeCloseTo(rgb?.[1] ?? -1, 3);
    expect(rgb?.[1]).toBeCloseTo(rgb?.[2] ?? -1, 3);
  });

  it('parses oklch(L% C H) and clamps into 0..1', () => {
    const rgb = parseBrandColour('oklch(62.8% 0.258 29.23)');
    expect(rgb).not.toBeNull();
    for (const channel of rgb ?? []) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
    expect(rgb?.[0]).toBeGreaterThan(0.9);
  });

  it.each(['red', '#12345', 'oklch(0.5 0.2)', 'rgb(0,0,0)', 'url(x)', 'oklch(1.5 0 0)', ''])(
    'drops %j (fail closed)',
    (value) => {
      expect(parseBrandColour(value)).toBeNull();
    },
  );
});

describe('contrastForeground', () => {
  it('is white on black and black on white', () => {
    expect(contrastForeground([0, 0, 0])).toBe(WHITE);
    expect(contrastForeground([1, 1, 1])).toBe(BLACK);
  });

  it('is black on a light brand (yellow) and white on a dark one (blue)', () => {
    expect(contrastForeground([1, 1, 0])).toBe(BLACK);
    expect(contrastForeground(parseBrandColour('#1d4ed8') ?? [1, 1, 1])).toBe(WHITE);
  });
});

describe('isSafeThemeValue', () => {
  it.each([
    'oklch(0.5 0.1 250)',
    'oklch(1 0 0 / 10%)',
    '#0a7cff',
    '#abc',
    '0.5rem',
    'rgb(10, 20, 30)',
    'hsl(210 40% 50%)',
  ])('accepts %s', (value) => {
    expect(isSafeThemeValue(value)).toBe(true);
  });

  it('rejects url(x)', () => {
    expect(isSafeThemeValue('url(x)')).toBe(false);
  });

  it('rejects url(//x/y) although THEME_VALUE alone admits it', () => {
    expect(THEME_VALUE.test('url(//x/y)')).toBe(true);
    expect(THEME_VALUE_REJECT.test('url(//x/y)')).toBe(true);
    expect(isSafeThemeValue('url(//x/y)')).toBe(false);
  });

  it('rejects expression(1)', () => {
    expect(isSafeThemeValue('expression(1)')).toBe(false);
  });

  it('rejects @import x', () => {
    expect(isSafeThemeValue('@import x')).toBe(false);
  });

  it('rejects a comment opener /* */', () => {
    expect(isSafeThemeValue('/* */')).toBe(false);
  });

  it('rejects a;b', () => {
    expect(isSafeThemeValue('a;b')).toBe(false);
  });

  it('rejects }', () => {
    expect(isSafeThemeValue('}')).toBe(false);
  });

  it('rejects <', () => {
    expect(isSafeThemeValue('<')).toBe(false);
  });

  it('rejects a backslash, a newline, an empty value and one over 64 characters', () => {
    expect(isSafeThemeValue('a\\b')).toBe(false);
    expect(isSafeThemeValue('a\nb')).toBe(false);
    expect(isSafeThemeValue('')).toBe(false);
    expect(isSafeThemeValue('a'.repeat(65))).toBe(false);
    expect(isSafeThemeValue('a'.repeat(64))).toBe(true);
  });

  it('is case-insensitive on the reject list and case-sensitive on the grammar', () => {
    expect(isSafeThemeValue('URL(x)')).toBe(false);
    expect(isSafeThemeValue('OKLCH(1 0 0)')).toBe(false);
  });
});

describe('themeCss', () => {
  it('writes primary to both fills with a computed foreground, and ignores foregrounds and meanings the api sends', () => {
    const css =
      themeCss({
        primary: '#1d4ed8',
        'primary-foreground': '#ffffff',
        destructive: '#00ff00',
        ring: '#fff',
      }) ?? '';
    expect(css).toContain('--primary:#1d4ed8');
    expect(css).toContain('--sidebar-primary:#1d4ed8');
    expect(css).toContain(`--primary-foreground:${WHITE}`);
    expect(css).toContain(`--sidebar-primary-foreground:${WHITE}`);
    expect(css).not.toContain('--destructive');
    expect(css).not.toContain('--ring');
    expect(css).not.toContain('#ffffff');
  });

  it('gives a light brand a black foreground', () => {
    expect(themeCss({ primary: '#ff0' })).toBe(
      `:root{--primary:#ff0;--sidebar-primary:#ff0;--primary-foreground:${BLACK};--sidebar-primary-foreground:${BLACK}}`,
    );
  });

  it('drops a primary it cannot parse: the neutral default stays', () => {
    expect(themeCss({ primary: 'red' })).toBeNull();
    expect(themeCss({ primary: 'rgb(10, 20, 30)' })).toBeNull();
  });

  it('writes radius alone when it is safe', () => {
    expect(themeCss({ radius: '0.5rem' })).toBe(':root{--radius:0.5rem}');
  });

  it('drops an unsafe value before parsing it', () => {
    expect(themeCss({ primary: '#fff;}body{x:y' })).toBeNull();
    expect(themeCss({ primary: 'url(//x/y)', radius: '1rem' })).toBe(':root{--radius:1rem}');
  });

  it('drops every token that is not brandable', () => {
    expect(
      themeCss({
        'color-primary': '#fff',
        evil: '#000',
        success: '#0f0',
        border: '#000',
        input: '#000',
        'sidebar-primary': '#000',
        'sidebar-primary-foreground': '#000',
      }),
    ).toBeNull();
  });

  it('returns null for an empty theme', () => {
    expect(themeCss({})).toBeNull();
  });

  it('never emits ; } < or a newline it did not put there itself', () => {
    const css = themeCss({ primary: '#abc', radius: '0.5rem' }) ?? '';
    expect(css.replaceAll(/:root\{|\}|;/g, '')).not.toMatch(/[;}<\n]/);
  });
});
