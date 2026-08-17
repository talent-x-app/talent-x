import { render, screen } from '@testing-library/react-native';
import { ThemeProvider, gradientX, lightTheme } from '@talent-x/design-tokens';
import { type ReactNode } from 'react';
import { TxLogo } from './TxLogo';

const wrap = (children: ReactNode) => <ThemeProvider>{children}</ThemeProvider>;

/** Nœuds de l'arbre rendu portant un type `react-native-svg` donné. */
type Node = { type?: string; props?: Record<string, unknown>; children?: Node[] | null };
function nodesOfType(tree: Node | Node[] | null, type: string): Node[] {
  if (tree == null) return [];
  if (Array.isArray(tree)) return tree.flatMap((n) => nodesOfType(n, type));
  return [...(tree.type === type ? [tree] : []), ...nodesOfType(tree.children ?? null, type)];
}

/**
 * `react-native-svg` convertit les couleurs en entiers ARGB — signés dans le tableau
 * `gradient`, non signés dans `fill.payload`. `>>> 0` normalise les deux.
 */
const argb = (hex: string) => ((0xff << 24) | parseInt(hex.slice(1), 16)) >>> 0;
const fillOf = (node: Node) => ((node.props?.fill as { payload: number }).payload >>> 0) as number;

describe('TxLogo', () => {
  it('peint la pastille avec le dégradé du design system (token gradientX)', () => {
    const tree = render(wrap(<TxLogo testID="logo" />)).toJSON() as Node;

    const [gradient] = nodesOfType(tree, 'RNSVGLinearGradient');
    expect(gradient).toBeDefined();

    // `gradient` entrelace offset et couleur : [o0, c0, o1, c1, ...].
    const stops = gradient.props?.gradient as number[];
    const offsets = stops.filter((_, i) => i % 2 === 0);
    const colors = stops.filter((_, i) => i % 2 === 1).map((c) => c >>> 0);

    // Le cœur du test : le dégradé n'est pas recopié en dur, il vient du token.
    expect(offsets).toEqual([...gradientX.locations]);
    expect(colors).toEqual(gradientX.colors.map(argb));

    // Direction du dégradé également issue du token.
    expect(gradient.props).toMatchObject({
      x1: `${gradientX.start.x}`,
      y1: `${gradientX.start.y}`,
      x2: `${gradientX.end.x}`,
      y2: `${gradientX.end.y}`,
    });
  });

  it("garde le rayon et l'échelle du monogramme de l'icône de l'app", () => {
    const size = 512; // même canevas que design/assets/app-icon.svg → valeurs comparables
    const tree = render(wrap(<TxLogo size={size} />)).toJSON() as Node;

    // app-icon.svg : rx = 115 sur un canevas de 512.
    const [rect] = nodesOfType(tree, 'RNSVGRect');
    expect(rect.props?.rx).toBeCloseTo(115, 1);

    // app-icon.svg : monogramme à 74 % de la largeur → scale 512*0.74/230 = 1.6473.
    const paths = nodesOfType(tree, 'RNSVGPath');
    expect(paths).toHaveLength(2);
    const [scaleX] = paths[0].props?.matrix as number[];
    expect(scaleX).toBeCloseTo(1.6473, 3);
  });

  it('remplit le monogramme en textOnAccent sur la pastille', () => {
    const tree = render(wrap(<TxLogo />)).toJSON() as Node;
    for (const path of nodesOfType(tree, 'RNSVGPath')) {
      expect(fillOf(path)).toBe(argb(lightTheme.colors.textOnAccent));
    }
  });

  it('variante monogram : pas de pastille, teinte accent par défaut', () => {
    const tree = render(wrap(<TxLogo variant="monogram" />)).toJSON() as Node;

    expect(nodesOfType(tree, 'RNSVGRect')).toHaveLength(0);
    expect(nodesOfType(tree, 'RNSVGLinearGradient')).toHaveLength(0);
    for (const path of nodesOfType(tree, 'RNSVGPath')) {
      expect(fillOf(path)).toBe(argb(lightTheme.colors.accent));
    }
  });

  it('variante monogram : la hauteur suit le tracé, sans bande vide', () => {
    const size = 230; // largeur du viewBox source → hauteur attendue = 114
    const tree = render(wrap(<TxLogo variant="monogram" size={size} />)).toJSON() as Node;
    expect(tree.props?.height).toBeCloseTo(114, 1);
  });

  it('accepte une teinte explicite en variante monogram', () => {
    const tree = render(wrap(<TxLogo variant="monogram" color="#FF00AA" />)).toJSON() as Node;
    for (const path of nodesOfType(tree, 'RNSVGPath')) {
      expect(fillOf(path)).toBe(argb('#FF00AA'));
    }
  });

  it('est annoncé comme une image nommée Talent-X', () => {
    render(wrap(<TxLogo testID="logo" />));
    const svg = screen.getByTestId('logo');
    expect(svg).toBeOnTheScreen();
    expect(svg.props.accessibilityRole).toBe('image');
    expect(svg.props.accessibilityLabel).toBe('Talent-X');
  });
});
