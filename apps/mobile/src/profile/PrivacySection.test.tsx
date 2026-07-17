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
const mockGetMyGroups = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getConsents: (...args: unknown[]) => mockGetConsents(...args),
  updateConsent: (...args: unknown[]) => mockUpdateConsent(...args),
  requestExport: (...args: unknown[]) => mockRequestExport(...args),
  getExport: (...args: unknown[]) => mockGetExport(...args),
  deleteMe: (...args: unknown[]) => mockDeleteMe(...args),
  getMyGroups: (...args: unknown[]) => mockGetMyGroups(...args),
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

/** Groupe factice pour la liste des coachs (ADR-51 §D2). */
function group(id: string, coach: { id: string; firstName?: string; lastName?: string }) {
  return { id, name: `G-${id}`, memberCount: 3, joinedAt: '2026-01-01T00:00:00.000Z', coach };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
  mockGetConsents.mockResolvedValue({
    status: 200,
    data: { data: [{ type: 'data_processing', granted: true }] },
  });
  // Mono-coach par défaut : pas d'interrupteurs par coach (comportement historique).
  mockGetMyGroups.mockResolvedValue({
    status: 200,
    data: { data: [group('g-1', { id: 'c-1', firstName: 'Carl', lastName: 'Lewis' })] },
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

  it('R13 : le consentement marketing porte un libellé distinct de la préférence de notif', async () => {
    render(<PrivacySection role="athlete" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('privacy-consent-marketing')).toBeOnTheScreen());
    // Consentement RGPD = « Communications marketing » (≠ notif « Actualités Talent-X »).
    expect(screen.getByText('Communications marketing')).toBeOnTheScreen();
    expect(screen.queryByText('Actualités Talent-X')).toBeNull();
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

  it('mono-coach : aucun interrupteur par coach (comportement historique intact)', async () => {
    render(<PrivacySection role="athlete" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('privacy-consent-coach_access')).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('privacy-consent-coach-c-1')).toBeNull();
  });

  it('multi-coach (ADR-51 §D2) : un interrupteur par coach, scopé sinon repli global', async () => {
    mockGetMyGroups.mockResolvedValue({
      status: 200,
      data: {
        data: [
          group('g-1', { id: 'c-1', firstName: 'Carl', lastName: 'Lewis' }),
          group('g-2', { id: 'c-2', firstName: 'Flo', lastName: 'Jo' }),
        ],
      },
    });
    mockGetConsents.mockResolvedValue({
      status: 200,
      data: {
        data: [
          // Global accordé + révocation scopée à c-2 : c-1 hérite du global, c-2 est révoqué.
          { type: 'coach_access', granted: true },
          { type: 'coach_access', granted: false, coachId: 'c-2' },
        ],
      },
    });
    render(<PrivacySection role="athlete" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('privacy-consent-coach-c-1')).toBeOnTheScreen());
    expect(screen.getByText('Carl Lewis')).toBeOnTheScreen();
    expect(screen.getByText('Flo Jo')).toBeOnTheScreen();
    expect(screen.getByTestId('privacy-consent-coach-c-1').props.value).toBe(true);
    expect(screen.getByTestId('privacy-consent-coach-c-2').props.value).toBe(false);
    // L'interrupteur global reflète la dernière décision globale, pas les lignes scopées.
    expect(screen.getByTestId('privacy-consent-coach_access').props.value).toBe(true);
  });

  it('multi-coach : basculer un coach appelle updateConsent {type, granted, coachId}', async () => {
    mockUpdateConsent.mockResolvedValue({ status: 200, data: {} });
    mockGetMyGroups.mockResolvedValue({
      status: 200,
      data: {
        data: [
          group('g-1', { id: 'c-1', firstName: 'Carl', lastName: 'Lewis' }),
          group('g-2', { id: 'c-2', firstName: 'Flo', lastName: 'Jo' }),
        ],
      },
    });
    render(<PrivacySection role="athlete" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('privacy-consent-coach-c-2')).toBeOnTheScreen());
    fireEvent(screen.getByTestId('privacy-consent-coach-c-2'), 'valueChange', true);

    await waitFor(() =>
      expect(mockUpdateConsent).toHaveBeenCalledWith({
        type: 'coach_access',
        granted: true,
        coachId: 'c-2',
      }),
    );
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
