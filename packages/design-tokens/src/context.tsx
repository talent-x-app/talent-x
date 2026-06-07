/* ============================================================
   Talent-X Design System — contexte de thème (React Native)
   ThemeProvider + hooks. Dark-first (cf. règles de marque).
   ============================================================ */
import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from './tokens';

/** Contexte de thème — défaut dark-first. */
export const ThemeContext = createContext<Theme>(darkTheme);

/** Retourne le thème actif depuis le contexte. Envelopper l'app dans <ThemeProvider>. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Choisit le thème d'après le schéma de couleurs de l'OS (repli dark-first). */
export function useSystemTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'light' ? lightTheme : darkTheme;
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Force un thème ; si omis, suit le schéma de couleurs de l'OS (dark-first). */
  theme?: Theme;
}

/** Fournit le thème à l'arbre. Sans prop `theme`, suit l'OS (dark-first). */
export function ThemeProvider({ children, theme }: ThemeProviderProps) {
  const system = useSystemTheme();
  const value = theme ?? system;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
