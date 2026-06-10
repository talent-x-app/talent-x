import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockUseSession = jest.fn();
const mockRedirect = jest.fn();

jest.mock('./SessionProvider', () => ({
  useSession: () => mockUseSession(),
}));
// Redirect ne rend rien : on capture seulement la destination demandée.
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
}));

import { RoleGuard } from './RoleGuard';

function Child() {
  return <Text testID="child">contenu protégé</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RoleGuard (TLX-90)', () => {
  it('rend les enfants quand le rôle correspond', () => {
    mockUseSession.mockReturnValue({ role: 'athlete', isLoading: false });
    render(
      <RoleGuard role="athlete">
        <Child />
      </RoleGuard>,
    );

    expect(screen.getByTestId('child')).toBeOnTheScreen();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirige vers le login si non connecté (role null)', () => {
    mockUseSession.mockReturnValue({ role: null, isLoading: false });
    render(
      <RoleGuard role="athlete">
        <Child />
      </RoleGuard>,
    );

    expect(mockRedirect).toHaveBeenCalledWith('/(auth)/login');
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('redirige vers le login si le rôle ne correspond pas (mauvais espace)', () => {
    mockUseSession.mockReturnValue({ role: 'coach', isLoading: false });
    render(
      <RoleGuard role="athlete">
        <Child />
      </RoleGuard>,
    );

    expect(mockRedirect).toHaveBeenCalledWith('/(auth)/login');
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('affiche le splash (ni enfants ni redirection) pendant le chargement', () => {
    mockUseSession.mockReturnValue({ role: null, isLoading: true });
    render(
      <RoleGuard role="athlete">
        <Child />
      </RoleGuard>,
    );

    expect(screen.queryByTestId('child')).toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
