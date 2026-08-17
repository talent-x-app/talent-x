import { renderHook } from '@testing-library/react-native';
import {
  ThemeProvider,
  darkColors,
  darkTheme,
  lightColors,
  lightTheme,
} from '@talent-x/design-tokens';
import type { ReactNode } from 'react';

// Insets pilotés depuis le test : la valeur réelle vient de l'appareil, pas du code.
// Même patron que `OfflineBanner.test.tsx` (le module natif n'a rien à faire ici).
const mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));

import { useScreenSceneStyle } from './screen-inset';

function DarkWrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={darkTheme}>{children}</ThemeProvider>;
}

function LightWrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={lightTheme}>{children}</ThemeProvider>;
}

beforeEach(() => {
  Object.assign(mockInsets, { top: 0, bottom: 0, left: 0, right: 0 });
});

describe('useScreenSceneStyle', () => {
  it('réserve la zone sûre haute de l’appareil', () => {
    mockInsets.top = 47; // encoche iPhone

    const { result } = renderHook(() => useScreenSceneStyle(), { wrapper: DarkWrapper });

    expect(result.current.paddingTop).toBe(47);
  });

  it('suit l’appareil : une barre d’état plus fine réserve moins', () => {
    mockInsets.top = 24; // barre d'état Android classique

    const { result } = renderHook(() => useScreenSceneStyle(), { wrapper: DarkWrapper });

    expect(result.current.paddingTop).toBe(24);
  });

  // Sans couleur, la bande réservée laisse voir le fond par défaut du navigateur — clair,
  // donc une barre blanche très visible en thème sombre. Le padding seul ne suffit pas.
  it('peint la bande réservée avec le fond du thème (sombre)', () => {
    mockInsets.top = 47;

    const { result } = renderHook(() => useScreenSceneStyle(), { wrapper: DarkWrapper });

    expect(result.current.backgroundColor).toBe(darkColors.background);
  });

  it('suit le thème clair', () => {
    mockInsets.top = 47;

    const { result } = renderHook(() => useScreenSceneStyle(), { wrapper: LightWrapper });

    expect(result.current.backgroundColor).toBe(lightColors.background);
  });

  // Appareil sans encoche : rien à réserver, mais le fond reste posé — sinon la scène
  // retomberait sur le fond par défaut du navigateur.
  it('appareil sans zone sûre : aucun espace réservé, fond conservé', () => {
    const { result } = renderHook(() => useScreenSceneStyle(), { wrapper: DarkWrapper });

    expect(result.current.paddingTop).toBe(0);
    expect(result.current.backgroundColor).toBe(darkColors.background);
  });
});
