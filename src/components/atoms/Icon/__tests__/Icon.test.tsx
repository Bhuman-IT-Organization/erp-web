// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import registry from '@/assets/icons/registry.json';
import { renderWithProviders } from '@/test/render';
import { Icon, ICON_NAMES, type IconName } from '../Icon';

/**
 * FE-14's home: what matters is that every registry entry resolves to an icon we actually import
 * (otherwise a menu row renders the fallback in production and nothing fails in CI), that an unknown
 * name cannot throw, and that the icon stays out of the accessibility tree unless a caller asks.
 */

const svgIn = (container: HTMLElement): SVGElement | null => container.querySelector('svg');

describe('Icon', () => {
  it('renders an svg for a registered name and tags it with the name', () => {
    const { container } = renderWithProviders(<Icon name="user" />);
    const svg = svgIn(container);
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('data-icon-name')).toBe('user');
  });

  it('renders every registered glyph without falling back', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = renderWithProviders(<Icon name={name} />);
      const svg = svgIn(container);
      expect(svg, `${name} rendered nothing`).not.toBeNull();
      // The fallback is `circle-dot`'s icon; anything else resolving to it means a missing import.
      const classes = svg?.getAttribute('class') ?? '';
      expect(classes).toContain('size-4');
      unmount();
    }
  });

  it('resolves every registry value to an imported component, never the fallback by accident', () => {
    // Renders each name and reads back the lucide class lucide adds (`lucide-<kebab>`): two different
    // registry keys may share a component, but a key whose component is missing would carry the
    // fallback's class instead of its own.
    const classFor = (name: IconName): string => {
      const { container, unmount } = renderWithProviders(<Icon name={name} />);
      const classes = svgIn(container)?.getAttribute('class') ?? '';
      unmount();
      return classes;
    };
    const fallback = classFor('circle-dot');
    const unexpectedFallback = ICON_NAMES.filter(
      (name) => name !== 'circle-dot' && classFor(name) === fallback,
    );
    expect(unexpectedFallback).toEqual([]);
  });

  it('registers the 14 glyphs the base UI kit needs (03.2 UI-SPEC § Component Inventory)', () => {
    const kit = {
      'magnifying-glass': 'Search',
      xmark: 'X',
      eye: 'Eye',
      'eye-slash': 'EyeOff',
      'ellipsis-vertical': 'EllipsisVertical',
      'arrow-up': 'ArrowUp',
      'arrow-down': 'ArrowDown',
      sort: 'ArrowUpDown',
      download: 'Download',
      image: 'Image',
      'chevron-left': 'ChevronLeft',
      'rotate-right': 'RotateCw',
      'triangle-exclamation': 'TriangleAlert',
      plus: 'Plus',
    } as const;
    const registered: Record<string, string> = registry;
    for (const [name, component] of Object.entries(kit)) {
      expect(registered[name], name).toBe(component);
      const { container, unmount } = renderWithProviders(<Icon name={name as IconName} />);
      expect(svgIn(container), `${name} rendered nothing`).not.toBeNull();
      unmount();
    }
  });

  it('registers the six glyphs the 04.2 kit adds (04.2 UI-SPEC § Design System)', () => {
    const added = {
      barcode: 'Barcode',
      upload: 'Upload',
      print: 'Printer',
      paperclip: 'Paperclip',
      filter: 'ListFilter',
      lock: 'Lock',
    } as const;
    const registered: Record<string, string> = registry;
    for (const [name, component] of Object.entries(added)) {
      expect(registered[name], name).toBe(component);
      const { container, unmount } = renderWithProviders(<Icon name={name as IconName} />);
      const kebab = component.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      expect(svgIn(container)?.getAttribute('class'), name).toContain(`lucide-${kebab}`);
      unmount();
    }
  });

  it('registers paper-plane, the glyph shared mail adds for "Send a test to me" and Resend (4.3 M2)', () => {
    const registered: Record<string, string> = registry;
    expect(registered['paper-plane']).toBe('Send');
    const { container, unmount } = renderWithProviders(<Icon name="paper-plane" />);
    expect(svgIn(container)?.getAttribute('class')).toContain('lucide-send');
    unmount();
  });

  it('renders the fallback for an unknown name and does not throw', () => {
    // A menu item with a typo must not take the shell down; the cast is the point of the test.
    const { container } = renderWithProviders(<Icon name={'not-a-glyph' as IconName} />);
    expect(svgIn(container)).not.toBeNull();
    expect(svgIn(container)?.getAttribute('data-icon-name')).toBe('not-a-glyph');
  });

  it('is decorative by default and honours aria-hidden={false}', () => {
    const { container, unmount } = renderWithProviders(<Icon name="user" />);
    expect(svgIn(container)?.getAttribute('aria-hidden')).toBe('true');
    unmount();
    const { container: visible } = renderWithProviders(<Icon name="user" aria-hidden={false} />);
    expect(svgIn(visible)?.getAttribute('aria-hidden')).toBe('false');
  });

  it('merges a caller className over the default size', () => {
    const { container } = renderWithProviders(<Icon name="user" className="size-5" />);
    expect(svgIn(container)?.getAttribute('class')).toContain('size-5');
  });

  it('declares one entry per glyph the menu uses and every value is a PascalCase lucide name', () => {
    expect(ICON_NAMES.length).toBe(Object.keys(registry).length);
    const values = Object.values(registry);
    expect(values.filter((value) => !/^[A-Z][A-Za-z0-9]*$/.test(value))).toEqual([]);
  });
});

/**
 * A directional glyph (a lucide `...Left` or `...Right` component: a chevron, an arrow, the panel
 * toggle) means "back", "forward", "into" or "the sidebar's side", so under `ar` it must point the
 * other way. Every place one is rendered, through the atom (`<Icon name="chevron-right" />`) or as a
 * lucide element in a generated primitive (`<ChevronRightIcon />`), carries the `rtl:rotate-180` flip
 * in its className (plan 03.2-22; measured on screen in both directions by the RTL icon run). A
 * symmetric glyph (`ArrowLeftRight`) and a non-directional one (`ExternalLink`) are not matched.
 */
const DIRECTIONAL_COMPONENT = /^(?!.*LeftRight)[A-Z][A-Za-z]*(Left|Right)$/;
const DIRECTIONAL_NAMES = new Set(
  Object.entries(registry)
    .filter(([, component]) => DIRECTIONAL_COMPONENT.test(component))
    .map(([name]) => name),
);

function sourcesUnder(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), { recursive: true, encoding: 'utf8' })
    .map((file) => `${dir}/${file.split(sep).join('/')}`)
    .filter((file) => file.endsWith('.tsx'))
    .filter((file) => !file.includes('/__tests__/') && !file.endsWith('.stories.tsx'));
}

/** `file:line name` of every directional glyph, and whether its className holds the flip. */
function directionalGlyphs(file: string): { where: string; flips: boolean }[] {
  const text = readFileSync(join(process.cwd(), file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { where: string; flips: boolean }[] = [];
  const attribute = (node: ts.JsxOpeningLikeElement, name: string) =>
    node.attributes.properties.find(
      (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(source) === name,
    );
  const strings = (node: ts.Node | undefined): string[] => {
    if (node === undefined) return [];
    if (ts.isStringLiteralLike(node)) return [node.text];
    return node.getChildren(source).flatMap(strings);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const iconName =
        tag === 'Icon' ? strings(attribute(node, 'name')?.initializer)[0] : undefined;
      const lucide = tag.replace(/Icon$/, '');
      if (
        (iconName !== undefined && DIRECTIONAL_NAMES.has(iconName)) ||
        (tag !== 'Icon' && DIRECTIONAL_COMPONENT.test(lucide) && tag.endsWith('Icon'))
      ) {
        const classes = strings(attribute(node, 'className')?.initializer).flatMap((s) =>
          s.split(/\s+/),
        );
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        found.push({
          where: `${file}:${String(line + 1)} ${iconName ?? tag}`,
          flips: classes.includes('rtl:rotate-180'),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('directional glyphs under RTL (plan 03.2-22)', () => {
  it('every directional glyph (a registered ...Left or ...Right icon, or a lucide one in a primitive) carries the rtl:rotate-180 flip wherever it is rendered', () => {
    expect([...DIRECTIONAL_NAMES].sort()).toEqual(['chevron-left', 'chevron-right', 'panel-left']);
    const glyphs = [...sourcesUnder('src'), ...sourcesUnder('app')].flatMap(directionalGlyphs);
    expect(glyphs.length).toBeGreaterThan(0);
    expect(glyphs.filter((glyph) => !glyph.flips).map((glyph) => glyph.where)).toEqual([]);
    // It reads every source file (about 3.6 s alone, more each plan): under the coverage run's load
    // it passed the suite-wide 15 s twice in the erp-web coverage round, so it gets its own 30 s.
  }, 30_000);
});
