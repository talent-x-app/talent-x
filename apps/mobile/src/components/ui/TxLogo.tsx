import { useTheme } from '@talent-x/design-tokens';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Marque Talent-X — pastille dégradée + monogramme, rendue en **vectoriel**.
 *
 * Pourquoi du SVG et pas un `<Image source={require('...png')} />` : la marque est nette à
 * toutes les densités, le dégradé vient du token `gradientX` (donc suit le design system) et
 * `react-native-svg` est déjà une dépendance (graphes de progression A-06). Les PNG de
 * `apps/mobile/assets/` servent les emplacements que l'OS impose en bitmap (icône, splash,
 * favicon) — pas le rendu dans l'app.
 *
 * Tracés repris de `design/assets/monogram-white.svg` (viewBox 230 × 114) et proportions de
 * `design/assets/app-icon.svg`. Régénérer les PNG avec `node scripts/generate-brand-assets.mjs`
 * si la marque évolue, et reporter les tracés ici.
 */

/** viewBox du monogramme source (`design/assets/monogram-white.svg`). */
const MONOGRAM_WIDTH = 230;
const MONOGRAM_HEIGHT = 114;

/** Tracés du monogramme, tels quels depuis `monogram-white.svg`. */
const MONOGRAM_PATHS = [
  'M 32.00 97.75 L 61.50 82.00 L 78.25 32.50 L 114.75 32.50 L 106.75 14.00 L 20.50 15.25 L 14.00 32.50 L 53.00 33.00 Z',
  'M 216.25 14.25 L 183.75 14.00 L 149.50 35.75 L 137.25 15.25 L 109.75 14.00 L 129.00 47.75 L 41.00 99.75 L 79.00 99.75 L 136.75 64.50 L 160.00 98.75 L 192.75 99.50 L 160.50 51.25 Z',
] as const;

/**
 * Proportions de la pastille, reprises d'`app-icon.svg` (rayon 115 et monogramme à 74 % sur
 * un canevas de 512) — c'est ce qui garde le logo in-app identique à l'icône du launcher.
 */
const CORNER_RATIO = 115 / 512;
const MONOGRAM_RATIO = 0.74;

export interface TxLogoProps {
  /** Côté de la pastille, en points. */
  size?: number;
  /**
   * `badge` (défaut) : monogramme blanc sur pastille dégradée — usage héros (login, splash).
   * `monogram` : monogramme seul, teinté `color`, fond transparent — usage en ligne (en-têtes).
   */
  variant?: 'badge' | 'monogram';
  /** Teinte du monogramme en variante `monogram`. Défaut : `colors.accent`. */
  color?: string;
  testID?: string;
}

export function TxLogo({ size = 76, variant = 'badge', color, testID }: TxLogoProps) {
  const { colors, gradientX } = useTheme();
  const isBadge = variant === 'badge';

  // Monogramme centré, mis à l'échelle sur une fraction du côté de la pastille.
  const glyphWidth = size * (isBadge ? MONOGRAM_RATIO : 1);
  const scale = glyphWidth / MONOGRAM_WIDTH;
  const offsetX = (size - glyphWidth) / 2;
  const offsetY = (size - MONOGRAM_HEIGHT * scale) / 2;
  const fill = isBadge ? colors.textOnAccent : (color ?? colors.accent);

  // En variante `monogram` la hauteur suit le ratio du tracé : pas de bande vide autour.
  const height = isBadge ? size : MONOGRAM_HEIGHT * scale;

  return (
    <Svg
      width={size}
      height={height}
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel="Talent-X"
    >
      {isBadge && (
        <>
          <Defs>
            <LinearGradient
              id="txLogoBadge"
              x1={`${gradientX.start.x}`}
              y1={`${gradientX.start.y}`}
              x2={`${gradientX.end.x}`}
              y2={`${gradientX.end.y}`}
            >
              {gradientX.colors.map((stop, i) => (
                <Stop key={stop} offset={`${gradientX.locations[i]}`} stopColor={stop} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect width={size} height={size} rx={size * CORNER_RATIO} fill="url(#txLogoBadge)" />
        </>
      )}
      {MONOGRAM_PATHS.map((d) => (
        <Path
          key={d}
          d={d}
          fill={fill}
          transform={`translate(${isBadge ? offsetX : 0}, ${isBadge ? offsetY : 0}) scale(${scale})`}
        />
      ))}
    </Svg>
  );
}
