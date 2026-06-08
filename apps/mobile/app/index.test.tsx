import '@testing-library/react-native/extend-expect';
import { ThemeProvider } from '@talent-x/design-tokens';
import { render, screen } from '@testing-library/react-native';
import HomeScreen from './index';

// Test de rendu de l'écran d'accueil (TLX-015) : valide que le harnais mobile
// (jest-expo + Testing Library) rend un écran réel câblé au design system.
describe('HomeScreen', () => {
  it('affiche le titre et le sous-titre Fondations', () => {
    render(
      <ThemeProvider>
        <HomeScreen />
      </ThemeProvider>,
    );

    expect(screen.getByText('Talent-X')).toBeOnTheScreen();
    expect(screen.getByText('Fondations — design system')).toBeOnTheScreen();
  });
});
