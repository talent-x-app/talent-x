import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';
import { Linking } from 'react-native';

const mockGetConsents = jest.fn();
const mockUpdateConsent = jest.fn();
const mockRequestExport = jest.fn();
const mockGetExport = jest.fn();
const mockDeleteMe = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getConsents: (...args: unknown[]) => mockGetConsents(...args),
  updateConsent: (...args: unknown[]) => mockUpdateConsent(...args),
  requestExport: (...args: unknown[]) => mockRequestExport(...args),
  getExport: (...args: unknown[]) => mockGetExport(...args),
  deleteMe: (...args: unknown[]) => mockDeleteMe(...args),
  ConsentType: {
    data_processing: 'data_processing',
    coach_access: 'coach_access',
    marketing: 'marketing',
  },
  JobStatus: { pending: 'pending', processing: 'processing', ready: 'ready', failed: 'failed' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('../auth/SessionProvider', () => ({
  useSession: () => ({
    signOut: mockSignOut,
    role: 'athlete',
    isLoading: false,
    signIn: jest.fn(),
  }),
}));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur serveur', description: 'Réessayez.' }),
}));

import { PrivacySection } from './PrivacySection';

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
  mockGetConsents.mockResolvedValue({
    status: 200,
    data: { data: [{ type: 'data_processing', granted: true }] },
  });
});

describe('PrivacySection — consentements (TLX-106)', () => {
  it('athlète : affiche les 3 consentements avec l’état serveur', async () => {
    render(<PrivacySection role="athlete" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('privacy-consent-data_processing')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('privacy-consent-coach_access')).toBeOnTheScreen();
    expect(screen.getByTestId('privacy-consent-marketing')).toBeOnTheScreen();
    // data_processing accordé côté serveur → interrupteur actif.
    expect(screen.getByTestId('privacy-consent-data_processing').props.value).toBe(true);
    expect(screen.getByTestId('privacy-consent-coach_access').props.value).toBe(false);
  });

  it('coach : seul le consentement marketing est présenté', async () => {
    render(<PrivacySection role="coach" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('privacy-consent-marketing')).toBeOnTheScreen());
    expect(screen.queryByTestId('privacy-consent-data_processing')).toBeNull();
    expect(screen.queryByTestId('privacy-consent-coach_access')).toBeNull();
  });

  it('basculer un consentement appelle updateConsent {type, granted}', async () => {
    mockUpdateConsent.mockResolvedValue({ status: 200, data: {} });
    render(<PrivacySection role="athlete" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('privacy-consent-coach_access')).toBeOnTheScreen(),
    );
    fireEvent(screen.getByTestId('privacy-consent-coach_access'), 'valueChange', true);

    await waitFor(() => expect(mockUpdateConsent).toHaveBeenCalled());
    expect(mockUpdateConsent).toHaveBeenCalledWith({ type: 'coach_access', granted: true });
  });

  it('échec de mise à jour : rollback optimiste + toast d’erreur', async () => {
    mockUpdateConsent.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<PrivacySection role="athlete" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('privacy-consent-coach_access')).toBeOnTheScreen(),
    );
    fireEvent(screen.getByTestId('privacy-consent-coach_access'), 'valueChange', true);

    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' })),
    );
    // Rollback : l’interrupteur revient à false (invalidation re-fetch l’état serveur).
    await waitFor(() =>
      expect(screen.getByTestId('privacy-consent-coach_access').props.value).toBe(false),
    );
  });

  it('consentements indisponibles : message d’erreur dédié', async () => {
    mockGetConsents.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<PrivacySection role="athlete" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('privacy-consents-error')).toBeOnTheScreen());
  });
});

describe('PrivacySection — export RGPD (TLX-106)', () => {
  it('demande l’export (202) puis propose le téléchargement quand prêt', async () => {
    mockRequestExport.mockResolvedValue({
      status: 202,
      data: { jobId: 'job-1', status: 'pending' },
    });
    mockGetExport.mockResolvedValue({
      status: 200,
      data: { jobId: 'job-1', status: 'ready', downloadUrl: 'https://dl.example/job-1' },
    });
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    render(<PrivacySection role="athlete" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('privacy-export-request')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('privacy-export-request'));

    await waitFor(() => expect(mockRequestExport).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('privacy-export-download')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('privacy-export-download'));
    expect(openURL).toHaveBeenCalledWith('https://dl.example/job-1');
    openURL.mockRestore();
  });

  it('export en échec : message + bouton réessayer', async () => {
    mockRequestExport.mockResolvedValue({
      status: 202,
      data: { jobId: 'job-2', status: 'pending' },
    });
    mockGetExport.mockResolvedValue({ status: 200, data: { jobId: 'job-2', status: 'failed' } });
    render(<PrivacySection role="athlete" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('privacy-export-request')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('privacy-export-request'));

    await waitFor(() => expect(screen.getByTestId('privacy-export-retry')).toBeOnTheScreen());
  });
});

describe('PrivacySection — suppression de compte (TLX-106)', () => {
  it('confirmation en deux temps puis deleteMe (202) → signOut + redirection', async () => {
    mockDeleteMe.mockResolvedValue({ status: 202, data: {} });
    render(<PrivacySection role="athlete" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('privacy-delete-start')).toBeOnTheScreen());
    // 1er temps : aucune suppression sans la confirmation explicite.
    fireEvent.press(screen.getByTestId('privacy-delete-start'));
    expect(screen.getByTestId('privacy-delete-warning')).toBeOnTheScreen();
    expect(mockDeleteMe).not.toHaveBeenCalled();

    // 2e temps : confirmation → suppression effective.
    fireEvent.press(screen.getByTestId('privacy-delete-confirm'));
    await waitFor(() => expect(mockDeleteMe).toHaveBeenCalled());
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('annuler referme la confirmation sans supprimer', async () => {
    render(<PrivacySection role="athlete" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('privacy-delete-start')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('privacy-delete-start'));
    fireEvent.press(screen.getByTestId('privacy-delete-cancel'));

    expect(screen.queryByTestId('privacy-delete-warning')).toBeNull();
    expect(mockDeleteMe).not.toHaveBeenCalled();
  });
});
