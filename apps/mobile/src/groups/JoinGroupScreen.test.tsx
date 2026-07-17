import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockJoinGroup = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  joinGroup: (...a: unknown[]) => mockJoinGroup(...a),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur', description: undefined }),
}));

// expo-camera mocké (TLX-188) : permission contrôlable + CameraView qui expose son
// onBarcodeScanned pour simuler la lecture d'un QR sans caméra réelle.
const mockRequestPermission = jest.fn();
let mockPermission: { granted: boolean; canAskAgain?: boolean } | null = { granted: true };
let lastScanHandler: ((event: { data: string }) => void) | undefined;

jest.mock('expo-camera', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useCameraPermissions: () => [mockPermission, mockRequestPermission],
    CameraView: (props: {
      testID?: string;
      onBarcodeScanned?: (event: { data: string }) => void;
    }) => {
      lastScanHandler = props.onBarcodeScanned;
      return <View testID={props.testID} />;
    },
  };
});

import { JoinGroupScreen } from './JoinGroupScreen';

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = { granted: true };
  lastScanHandler = undefined;
});

describe('JoinGroupScreen (TLX-88)', () => {
  it('rejoint un groupe avec un code valide puis revient en arrière', async () => {
    mockJoinGroup.mockResolvedValue({ status: 200, data: { groupId: 'g-1', athleteId: 'me' } });
    render(<JoinGroupScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('join-group-code'), 'abcd2345');
    fireEvent.press(screen.getByTestId('join-group-submit'));

    await waitFor(() => expect(mockJoinGroup).toHaveBeenCalledWith({ inviteCode: 'ABCD2345' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('met le code saisi en capitales', () => {
    render(<JoinGroupScreen />, { wrapper: Wrapper });
    const input = screen.getByTestId('join-group-code');
    fireEvent.changeText(input, 'wxyz9876');
    expect(input.props.value).toBe('WXYZ9876');
  });

  it('affiche un message inline sur code invalide (404)', async () => {
    mockJoinGroup.mockRejectedValue({ status: 404 });
    render(<JoinGroupScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('join-group-code'), 'BADCODE1');
    fireEvent.press(screen.getByTestId('join-group-submit'));

    await waitFor(() => expect(screen.getByText(/Code invalide ou révoqué/i)).toBeOnTheScreen());
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('JoinGroupScreen — scan du QR (TLX-188)', () => {
  it('scanne un QR valide : préremplit le code et soumet', async () => {
    mockJoinGroup.mockResolvedValue({ status: 200, data: { groupId: 'g-1', athleteId: 'me' } });
    render(<JoinGroupScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('join-group-scan-toggle'));
    expect(screen.getByTestId('join-group-qr-camera')).toBeOnTheScreen();

    lastScanHandler?.({ data: 'wxyz9876' });

    await waitFor(() => expect(mockJoinGroup).toHaveBeenCalledWith({ inviteCode: 'WXYZ9876' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('QR étranger : message inline, pas d’appel réseau, saisie manuelle intacte', async () => {
    render(<JoinGroupScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('join-group-scan-toggle'));
    lastScanHandler?.({ data: 'https://example.com/pas-un-code' });

    await waitFor(() => expect(screen.getByText(/QR non reconnu/i)).toBeOnTheScreen());
    expect(mockJoinGroup).not.toHaveBeenCalled();
    expect(screen.getByTestId('join-group-code')).toBeOnTheScreen();
  });

  it('permission non accordée : propose « Autoriser la caméra »', () => {
    mockPermission = { granted: false, canAskAgain: true };
    render(<JoinGroupScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('join-group-scan-toggle'));
    fireEvent.press(screen.getByTestId('join-group-qr-allow'));
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it('web : pas de bouton scan, hint « dispo sur mobile », saisie manuelle conservée', () => {
    const platform = jest.requireActual<typeof import('react-native')>('react-native').Platform;
    const osSpy = jest.replaceProperty(platform, 'OS', 'web');
    try {
      render(<JoinGroupScreen />, { wrapper: Wrapper });
      expect(screen.queryByTestId('join-group-scan-toggle')).toBeNull();
      expect(screen.getByTestId('join-group-scan-hint')).toBeOnTheScreen();
      expect(screen.getByTestId('join-group-code')).toBeOnTheScreen();
    } finally {
      osSpy.restore();
    }
  });
});
