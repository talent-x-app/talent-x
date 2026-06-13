import { useWindowDimensions } from 'react-native';

/**
 * Primitive responsive (TLX-123) — l'app tourne sous Expo web ; les coachs planifient sur grand
 * écran. Sur mobile (compact) rien ne change ; au-delà du seuil tablette, le contenu est **centré
 * et borné en largeur** pour éviter des lignes interminables et des cartes étirées. Pur et
 * déterministe (largeur injectée) → testable sans monter d'écran ; les hooks dérivent de
 * `useWindowDimensions` (réactif aux rotations / redimensionnements de fenêtre web).
 */

/** Seuil tablette (px) : en deçà = téléphone (plein écran). */
export const BREAKPOINT_MEDIUM = 600;
/** Seuil desktop / grande tablette paysage (px). */
export const BREAKPOINT_EXPANDED = 1024;

/** Largeur de contenu maximale au-delà du seuil tablette (confort de lecture). */
export const CONTENT_MAX_WIDTH = 960;

export type Breakpoint = 'compact' | 'medium' | 'expanded';

/** Classe de largeur d'une fenêtre donnée. */
export function breakpointForWidth(width: number): Breakpoint {
  if (width >= BREAKPOINT_EXPANDED) return 'expanded';
  if (width >= BREAKPOINT_MEDIUM) return 'medium';
  return 'compact';
}

/**
 * Largeur de contenu maximale pour une largeur d'écran : bornée dès le seuil tablette, libre
 * (`undefined`) sur téléphone. Au-delà de `CONTENT_MAX_WIDTH` le contenu cesse de s'étirer.
 */
export function contentMaxWidthForWidth(width: number): number | undefined {
  return width >= BREAKPOINT_MEDIUM ? CONTENT_MAX_WIDTH : undefined;
}

/** Classe de largeur réactive de la fenêtre courante. */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return breakpointForWidth(width);
}

/** `true` au-delà du seuil tablette (web/tablette) — pour activer des dispositions élargies. */
export function useIsWide(): boolean {
  return useBreakpoint() !== 'compact';
}

/** Largeur de contenu maximale réactive (`undefined` sur téléphone). */
export function useContentMaxWidth(): number | undefined {
  const { width } = useWindowDimensions();
  return contentMaxWidthForWidth(width);
}
