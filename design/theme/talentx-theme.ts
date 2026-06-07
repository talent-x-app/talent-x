/* ============================================================
   Talent-X Design System — React Native / Expo theme
   Typed theme object + light/dark palettes + useTheme() hook.
   Source of truth: tokens.json. No hard-coded colors in components —
   always read from useTheme().
   ============================================================ */
import { useColorScheme } from 'react-native';
import { createContext, useContext } from 'react';

/* ---------- Primitive ramps (theme-independent) ---------- */
export const palette = {
  blue: {
    50: '#EBF3FF', 100: '#D6E7FF', 200: '#ADCFFF', 300: '#85B8FF',
    400: '#5BAEFF', 500: '#2E7CF6', 600: '#1B5BE0', 700: '#1747B0',
    800: '#143A8C', 900: '#102C66',
  },
  navy: '#1F4E79',
  slate: {
    0: '#FFFFFF', 50: '#F4F6FA', 100: '#E7ECF3', 200: '#D3DAE6',
    300: '#B6C0D0', 400: '#8A94A6', 500: '#5C6678', 600: '#434B5C',
    700: '#2A3140', 800: '#161B27', 850: '#11151F', 900: '#0E121B', 950: '#0B0F17',
  },
  success: { 50: '#E6F8EF', 400: '#34D17F', 500: '#1FA968', 600: '#178A55' },
  warning: { 50: '#FFF6E5', 400: '#FFC24B', 500: '#F5A524', 600: '#C9821A' },
  danger:  { 50: '#FDECEE', 400: '#FF6B7A', 500: '#E5484D', 600: '#C23438' },
  info:    { 50: '#EBF3FF', 400: '#5BAEFF', 500: '#2E7CF6', 600: '#1B5BE0' },
  white: '#FFFFFF', black: '#000000',
} as const;

/* Signature X gradient — pass to expo-linear-gradient.
   colors + locations + 135° vector. Brand mark / single hero accent only. */
export const gradientX = {
  colors: ['#5BAEFF', '#2E7CF6', '#1B5BE0'] as const,
  locations: [0, 0.55, 1] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

/* ---------- Semantic colors per theme ---------- */
const lightColors = {
  background: palette.slate[50],
  surface: palette.slate[0],
  surfaceRaised: palette.slate[0],
  surfaceSunken: '#ECF0F6',
  border: 'rgba(11,15,23,0.10)',
  borderStrong: 'rgba(11,15,23,0.18)',
  textPrimary: palette.slate[950],
  textSecondary: '#3C4456',
  textMuted: palette.slate[500],
  textOnAccent: palette.slate[0],
  accent: palette.blue[500],
  accentHover: palette.blue[600],
  accentPressed: palette.blue[700],
  accentText: palette.blue[700],
  accentSubtle: palette.blue[50],
  focusRing: palette.blue[500],
  overlay: 'rgba(11,15,23,0.45)',
  success: palette.success[600],
  warning: palette.warning[600],
  danger: palette.danger[500],
  info: palette.info[600],
  successBg: palette.success[50],
  warningBg: palette.warning[50],
  dangerBg: palette.danger[50],
  infoBg: palette.info[50],
} as const;

const darkColors: typeof lightColors = {
  background: palette.slate[950],
  surface: palette.slate[850],
  surfaceRaised: palette.slate[800],
  surfaceSunken: palette.slate[900],
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  textPrimary: palette.slate[100],
  textSecondary: palette.slate[400],
  textMuted: palette.slate[500],
  textOnAccent: palette.slate[0],
  accent: palette.blue[500],
  accentHover: palette.blue[400],
  accentPressed: palette.blue[600],
  accentText: palette.blue[400],
  accentSubtle: 'rgba(46,124,246,0.16)',
  focusRing: palette.blue[400],
  overlay: 'rgba(7,10,16,0.66)',
  success: palette.success[400],
  warning: palette.warning[400],
  danger: palette.danger[400],
  info: palette.info[400],
  successBg: 'rgba(52,209,127,0.14)',
  warningBg: 'rgba(255,194,75,0.14)',
  dangerBg: 'rgba(255,107,122,0.14)',
  infoBg: 'rgba(91,174,255,0.14)',
};

/* ---------- Theme-independent scales ---------- */
export const typography = {
  fontFamily: { regular: 'Poppins_400Regular', medium: 'Poppins_500Medium', semibold: 'Poppins_600SemiBold', bold: 'Poppins_700Bold' },
  display:  { fontSize: 44, lineHeight: 48, fontWeight: '700' as const, letterSpacing: -0.9 },
  h1:       { fontSize: 34, lineHeight: 39, fontWeight: '700' as const, letterSpacing: -0.7 },
  h2:       { fontSize: 28, lineHeight: 34, fontWeight: '600' as const, letterSpacing: -0.3 },
  h3:       { fontSize: 22, lineHeight: 28, fontWeight: '600' as const, letterSpacing: -0.2 },
  title:    { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, letterSpacing: 0 },
  bodyLg:   { fontSize: 17, lineHeight: 26, fontWeight: '400' as const, letterSpacing: 0 },
  body:     { fontSize: 15, lineHeight: 23, fontWeight: '400' as const, letterSpacing: 0 },
  bodySm:   { fontSize: 13, lineHeight: 20, fontWeight: '400' as const, letterSpacing: 0 },
  caption:  { fontSize: 12, lineHeight: 17, fontWeight: '500' as const, letterSpacing: 0.1 },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 2.4, textTransform: 'uppercase' as const },
} as const;

export const spacing = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80, 24: 96 } as const;
export const radius  = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const borderWidth = { hairline: 1, thick: 2, focus: 2 } as const;
export const iconSize = { xs: 16, sm: 20, md: 24, lg: 32 } as const;
export const touchTarget = 44;

export const motion = {
  duration: { fast: 120, base: 220, slow: 360 },
  easing: {
    standard:   { x1: 0.2, y1: 0, x2: 0, y2: 1 },
    decelerate: { x1: 0, y1: 0, x2: 0.2, y2: 1 },
    accelerate: { x1: 0.4, y1: 0, x2: 1, y2: 1 },
    spring:     { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 },
  },
} as const;

/* Dark elevation favors hairline borders + accent glow over heavy shadows. */
export const elevation = {
  light: {
    sm: { shadowColor: '#0B0F17', shadowOpacity: 0.08, shadowRadius: 2,  shadowOffset: { width: 0, height: 1 },  elevation: 1 },
    md: { shadowColor: '#0B0F17', shadowOpacity: 0.10, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },  elevation: 4 },
    lg: { shadowColor: '#0B0F17', shadowOpacity: 0.14, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  },
  dark: {
    sm: { shadowColor: '#000000', shadowOpacity: 0,    shadowRadius: 0,  shadowOffset: { width: 0, height: 0 },  elevation: 0 },
    md: { shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },  elevation: 8 },
    glow: { shadowColor: '#2E7CF6', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  },
} as const;

export const opacity = { disabled: 0.4, muted: 0.64 } as const;

/* ---------- Theme assembly ---------- */
export type ThemeColors = typeof lightColors;
export interface Theme {
  name: 'light' | 'dark';
  colors: ThemeColors;
  palette: typeof palette;
  gradientX: typeof gradientX;
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  borderWidth: typeof borderWidth;
  iconSize: typeof iconSize;
  touchTarget: number;
  motion: typeof motion;
  elevation: typeof elevation.light;
  opacity: typeof opacity;
}

export const lightTheme: Theme = {
  name: 'light', colors: lightColors, palette, gradientX, typography, spacing,
  radius, borderWidth, iconSize, touchTarget, motion, elevation: elevation.light, opacity,
};
export const darkTheme: Theme = {
  name: 'dark', colors: darkColors, palette, gradientX, typography, spacing,
  radius, borderWidth, iconSize, touchTarget, motion, elevation: elevation.dark as unknown as typeof elevation.light, opacity,
};

/* ---------- Context + hook ---------- */
export const ThemeContext = createContext<Theme>(darkTheme); // dark-first

/** Returns the active theme from context. Wrap your app in <ThemeContext.Provider>. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Convenience: pick a theme directly from the OS color scheme (dark-first fallback). */
export function useSystemTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'light' ? lightTheme : darkTheme;
}

export default { lightTheme, darkTheme, palette, gradientX, typography, spacing, radius, motion, elevation };
