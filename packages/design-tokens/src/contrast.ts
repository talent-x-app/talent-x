/* ============================================================
   Talent-X Design System — ratio de contraste WCAG 2.1
   Module PUR (zéro dépendance react/react-native, testable en Node) servant à
   garder l'usage des tokens de texte conforme à l'accessibilité (TLX-145).
   Référence : WCAG 2.1 §1.4.3 — luminance relative + ratio (L1+0.05)/(L2+0.05).
   ============================================================ */

/** Seuils WCAG 2.1 de ratio de contraste texte/fond. */
export const WCAG = {
  /** Texte normal (< 18px, ou < 14px gras) — AA. */
  aaNormal: 4.5,
  /** Texte large (≥ 18px, ou ≥ 14px gras) — AA. */
  aaLarge: 3,
  /** Texte normal — AAA. */
  aaaNormal: 7,
} as const;

/** Parse un hex `#RGB` ou `#RRGGBB` en canaux 0..255. Lève si la forme est inattendue. */
function parseHex(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`Couleur hex invalide : ${hex}`);
  const h = m[1];
  const full = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Linéarise un canal sRGB 0..255 (WCAG 2.1). */
function channelLuminance(value0to255: number): number {
  const c = value0to255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminance relative d'une couleur hex opaque (0 = noir, 1 = blanc). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * Ratio de contraste entre deux couleurs **opaques** (1..21), indépendant de l'ordre.
 * Les fonds translucides (rgba) ne sont pas gérés (compositing requis) → passer la
 * couleur effective après aplatissement.
 */
export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Le ratio satisfait-il l'AA (texte normal par défaut, large si `large`) ? */
export function meetsAA(ratio: number, large = false): boolean {
  return ratio >= (large ? WCAG.aaLarge : WCAG.aaNormal);
}
