import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { OfflineBanner } from './OfflineBanner';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// On pilote l'état réseau via le hook dédié (le module natif NetInfo est isolé
// dans network-monitor, lui-même testé séparément).
const mockUseNetworkStatus = jest.fn();
jest.mock('./useNetworkStatus', () => ({
  useNetworkStatus: () => mockUseNetworkStatus(),
}));

const wrap = () =>
  render(
    <ThemeProvider>
      <OfflineBanner />
    </ThemeProvider>,
  );

describe('OfflineBanner (TLX-010)', () => {
  it('ne rend rien quand en ligne', () => {
    mockUseNetworkStatus.mockReturnValue(true);
    wrap();
    expect(screen.queryByText(/Hors ligne/)).toBeNull();
  });

  it('affiche le bandeau quand hors ligne', () => {
    mockUseNetworkStatus.mockReturnValue(false);
    wrap();
    expect(screen.getByText(/Hors ligne/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/Pas de connexion internet/)).toBeOnTheScreen();
  });
});
