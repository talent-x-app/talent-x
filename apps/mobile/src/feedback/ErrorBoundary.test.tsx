import '@testing-library/react-native/extend-expect';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('💥');
}

// Drapeau externe : le test le bascule avant « Réessayer » pour simuler une
// condition d'erreur transitoire qui se résout.
let shouldThrow = true;
function Recoverable() {
  if (shouldThrow) throw new Error('💥');
  return <Text>contenu sain</Text>;
}

const wrap = (children: React.ReactNode) =>
  render(
    <ThemeProvider>
      <ErrorBoundary>{children}</ErrorBoundary>
    </ThemeProvider>,
  );

describe('ErrorBoundary (TLX-010)', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    // React journalise l'erreur capturée : on le réduit au silence dans les tests.
    spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  it('rend les enfants quand tout va bien', () => {
    wrap(<Text>tout va bien</Text>);
    expect(screen.getByText('tout va bien')).toBeOnTheScreen();
  });

  it('affiche le repli quand un enfant lève une erreur de rendu', () => {
    wrap(<Boom />);
    expect(screen.getByTestId('error-boundary-fallback')).toBeOnTheScreen();
    expect(screen.getByText('Réessayer')).toBeOnTheScreen();
  });

  it('réessaie le rendu au tap sur « Réessayer »', () => {
    shouldThrow = true;
    wrap(<Recoverable />);
    expect(screen.getByTestId('error-boundary-fallback')).toBeOnTheScreen();

    // La condition transitoire se résout, puis on relance le rendu.
    shouldThrow = false;
    fireEvent.press(screen.getByText('Réessayer'));
    expect(screen.getByText('contenu sain')).toBeOnTheScreen();
  });
});
