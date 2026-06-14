/* Garde d'accessibilité (TLX-145) : le contraste des tokens de **texte** doit rester
   conforme WCAG 2.1 AA. Empêche une régression silencieuse (p.ex. ré-assombrir
   `textSecondary` ou rebrancher du texte essentiel sur `textMuted`). */
import { contrastRatio, relativeLuminance, meetsAA, WCAG } from './contrast';
import { lightColors, darkColors, type ThemeColors } from './tokens';

describe('contrastRatio (WCAG 2.1)', () => {
  it('blanc sur noir = 21:1, identité = 1:1, symétrique', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#0B0F17', '#0B0F17')).toBeCloseTo(1, 5);
    expect(contrastRatio('#8A94A6', '#0B0F17')).toBeCloseTo(
      contrastRatio('#0B0F17', '#8A94A6'),
      10,
    );
  });

  it('accepte la forme courte #RGB et rejette une valeur invalide', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'), 10);
    expect(() => relativeLuminance('not-a-color')).toThrow();
  });

  it('meetsAA distingue texte normal (4.5) et large (3)', () => {
    expect(meetsAA(WCAG.aaNormal)).toBe(true);
    expect(meetsAA(3.4)).toBe(false);
    expect(meetsAA(3.4, true)).toBe(true);
  });
});

describe('conformité AA des tokens de texte sur le fond du thème (TLX-145)', () => {
  const themes: Array<[string, ThemeColors]> = [
    ['dark', darkColors],
    ['light', lightColors],
  ];

  it.each(themes)(
    '[%s] textPrimary & textSecondary ≥ 4.5:1 sur background (AA texte normal)',
    (_name, c) => {
      expect(meetsAA(contrastRatio(c.textPrimary, c.background))).toBe(true);
      expect(meetsAA(contrastRatio(c.textSecondary, c.background))).toBe(true);
    },
  );

  it('[dark] textMuted est AA *large* seulement (≥ 3 mais < 4.5) → jamais pour du texte normal', () => {
    const ratio = contrastRatio(darkColors.textMuted, darkColors.background);
    expect(meetsAA(ratio, true)).toBe(true); // ≥ 3 : OK pour ≥ 18px / décoratif
    expect(meetsAA(ratio, false)).toBe(false); // < 4.5 : interdit sur du texte normal porteur d'info
  });

  it('[light] textMuted reste conforme AA texte normal (thème clair non concerné)', () => {
    expect(meetsAA(contrastRatio(lightColors.textMuted, lightColors.background))).toBe(true);
  });
});
