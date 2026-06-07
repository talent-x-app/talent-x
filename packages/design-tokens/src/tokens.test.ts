/* Test de parité : le portage RN (tokens.ts) ne doit pas diverger de la
   source de vérité W3C (tokens.json). On compare tout ce qui mappe proprement :
   rampes primitives, couleurs sémantiques light/dark, spacing, radius, et
   fontSize/fontWeight de la typo. Les conversions finement réglées à la main
   (line-height en px, letter-spacing em→points) sont volontairement hors test. */
import tokensJson from './tokens.json';
import {
  palette,
  lightColors,
  darkColors,
  spacing,
  radius,
  typography,
  type ThemeColors,
} from './tokens';

type Json = typeof tokensJson;
const primitive = (tokensJson as Json).color.primitive;
const themeJson = (tokensJson as Json).color.theme;

/** Résout une valeur de token : référence "{color.primitive.x.y}" ou littéral. */
function resolveColor(value: string): string {
  const m = /^\{color\.primitive\.([a-zA-Z]+)(?:\.(\d+))?\}$/.exec(value);
  if (!m) return value; // littéral (#hex / rgba)
  const family = (primitive as Record<string, unknown>)[m[1]];
  if (m[2] === undefined) return (family as { $value: string }).$value; // ex. navy, white, black
  return (family as Record<string, { $value: string }>)[m[2]].$value;
}

const kebabToCamel = (k: string): string =>
  k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

describe('parité tokens.ts ↔ tokens.json', () => {
  it('rampes primitives (blue, slate, success, warning, danger, info)', () => {
    for (const family of ['blue', 'slate', 'success', 'warning', 'danger', 'info'] as const) {
      const ramp = (primitive as Record<string, Record<string, { $value: string }>>)[family];
      for (const [shade, def] of Object.entries(ramp)) {
        if (typeof def?.$value !== 'string') continue;
        const got = (palette as Record<string, Record<string, string>>)[family][shade];
        expect(got).toBe(def.$value);
      }
    }
    expect(palette.navy).toBe(primitive.navy.$value);
    expect(palette.white).toBe(primitive.white.$value);
    expect(palette.black).toBe(primitive.black.$value);
  });

  it('couleurs sémantiques — thème clair', () => {
    for (const [key, def] of Object.entries(themeJson.light)) {
      const camel = kebabToCamel(key) as keyof ThemeColors;
      expect(lightColors[camel]).toBe(resolveColor((def as { $value: string }).$value));
    }
  });

  it('couleurs sémantiques — thème sombre', () => {
    for (const [key, def] of Object.entries(themeJson.dark)) {
      const camel = kebabToCamel(key) as keyof ThemeColors;
      expect(darkColors[camel]).toBe(resolveColor((def as { $value: string }).$value));
    }
  });

  it('spacing (px → nombre)', () => {
    for (const [key, def] of Object.entries((tokensJson as Json).spacing)) {
      if (typeof (def as { $value?: string }).$value !== 'string') continue;
      const px = parseInt((def as { $value: string }).$value, 10);
      expect((spacing as Record<string, number>)[key]).toBe(px);
    }
  });

  it('radius (px → nombre, hors icon-tile en %)', () => {
    for (const [key, def] of Object.entries((tokensJson as Json).radius)) {
      const raw = (def as { $value?: string }).$value;
      if (typeof raw !== 'string' || raw.endsWith('%')) continue;
      expect((radius as Record<string, number>)[key]).toBe(parseInt(raw, 10));
    }
  });

  it('typographie — fontSize et fontWeight', () => {
    const styles: Array<keyof typeof typography> = [
      'display',
      'h1',
      'h2',
      'h3',
      'title',
      'bodyLg',
      'body',
      'bodySm',
      'caption',
      'overline',
    ];
    const jsonKey: Record<string, string> = { bodyLg: 'body-lg', bodySm: 'body-sm' };
    for (const style of styles) {
      const key = jsonKey[style] ?? style;
      const def = (tokensJson as Json).typography[key as keyof Json['typography']].$value as {
        fontSize: string;
        fontWeight: number;
      };
      const ours = typography[style] as { fontSize: number; fontWeight: string };
      expect(ours.fontSize).toBe(parseInt(def.fontSize, 10));
      expect(Number(ours.fontWeight)).toBe(def.fontWeight);
    }
  });
});
