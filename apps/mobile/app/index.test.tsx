import '@testing-library/react-native/extend-expect';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';

jest.mock('expo-router', () => ({ Redirect: () => null }));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

import { SessionProvider } from '../src/auth/SessionProvider';
import CoachHomeScreen from './(coach)/index';
import AthleteHomeScreen from './(athlete)/index';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  );
}

describe('CoachHomeScreen (TLX-007)', () => {
  it('affiche le titre Accueil Coach', () => {
    render(<CoachHomeScreen />, { wrapper: Wrapper });
    expect(screen.getByText('Accueil Coach')).toBeOnTheScreen();
  });
});

describe('AthleteHomeScreen (TLX-007)', () => {
  it('affiche le titre Accueil', () => {
    render(<AthleteHomeScreen />, { wrapper: Wrapper });
    expect(screen.getByText('Accueil')).toBeOnTheScreen();
  });
});
