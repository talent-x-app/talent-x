import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';

const mockConfirmRecord = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  confirmRecord: (...a: unknown[]) => mockConfirmRecord(...a),
}));
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { RecordCandidatesCard } from './record-candidates-ui';

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

const PERFORMANCE = {
  id: 'p-1',
  assignmentId: 'as-1',
  athleteId: 'me',
  results: { schemaVersion: 2, items: [] },
  recordCandidates: [
    { eventKey: 'sprint:60m', label: '60 m', value: 6.39, unit: 's' as const, previousValue: 6.65 },
  ],
};

beforeEach(() => jest.clearAllMocks());

/**
 * Chemin d'**échec** de la confirmation de record (TLX-254). Il n'était couvert nulle part :
 * la carte n'était exercée qu'à travers deux écrans, et seulement dans son cas passant.
 *
 * Ce n'est pas une ligne choisie pour son poids statistique : un athlète qui valide un record
 * hors ligne, ou pendant une coupure, passe exactement par là. Sans ce test, rien ne garantit
 * qu'il soit averti — ni que la proposition lui reste offerte pour réessayer.
 */
describe('RecordCandidatesCard — échec de confirmation (TLX-254)', () => {
  it('erreur réseau : toast d’échec, et le record reste proposé', async () => {
    mockConfirmRecord.mockRejectedValue(new Error('offline'));
    render(<RecordCandidatesCard performance={PERFORMANCE} />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('record-confirm-sprint:60m'));

    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', title: expect.stringMatching(/Échec/) }),
      ),
    );
    // Le bouton reste : un échec ne doit pas faire disparaître la seule occasion de valider.
    expect(screen.getByTestId('record-confirm-sprint:60m')).toBeOnTheScreen();
    expect(screen.queryByTestId('record-confirmed-sprint:60m')).toBeNull();
  });

  it('réponse non-200 : traitée comme un échec, pas comme un succès silencieux', async () => {
    // `confirmRecord` résout avec une enveloppe `{ status }` : sans le `throw`, un 409 aurait
    // été lu comme une confirmation réussie et le record affiché comme validé à tort.
    mockConfirmRecord.mockResolvedValue({ status: 409, data: { error: 'CONFLICT' } });
    render(<RecordCandidatesCard performance={PERFORMANCE} />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('record-confirm-sprint:60m'));

    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' })),
    );
    expect(screen.queryByTestId('record-confirmed-sprint:60m')).toBeNull();
  });

  it('sans record précédent : « Première marque sur cette épreuve »', () => {
    render(
      <RecordCandidatesCard
        performance={{
          ...PERFORMANCE,
          recordCandidates: [
            { eventKey: 'jumps:long', label: 'Longueur', value: 5.2, unit: 'm' as const },
          ],
        }}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Première marque sur cette épreuve')).toBeOnTheScreen();
  });
});
