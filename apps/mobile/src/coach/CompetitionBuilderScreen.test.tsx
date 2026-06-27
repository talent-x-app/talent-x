import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockCreateCompetition = jest.fn();
const mockGetCompetition = jest.fn();
const mockUpdateCompetition = jest.fn();
const mockDeleteCompetition = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  createCompetition: (...a: unknown[]) => mockCreateCompetition(...a),
  getCompetition: (...a: unknown[]) => mockGetCompetition(...a),
  updateCompetition: (...a: unknown[]) => mockUpdateCompetition(...a),
  deleteCompetition: (...a: unknown[]) => mockDeleteCompetition(...a),
  CompetitionStatus: { draft: 'draft', published: 'published', cancelled: 'cancelled' },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: mockPush }),
}));
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { CompetitionBuilderScreen } from './CompetitionBuilderScreen';

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

beforeEach(() => jest.clearAllMocks());

// Référence « aujourd'hui » fixée → le sélecteur de date (TLX-197) s'ouvre sur juillet 2026.
const NOW = new Date('2026-07-15T00:00:00');

/** Sélectionne une date via le `DatePicker` : ouvre le calendrier puis presse la cellule du jour. */
function pickDate(testID: string, dayKey: string) {
  fireEvent.press(screen.getByTestId(testID));
  fireEvent.press(screen.getByTestId(`${testID}-cell-${dayKey}`));
}

describe('CompetitionBuilderScreen (TLX-101)', () => {
  it('rend le mode création', () => {
    render(<CompetitionBuilderScreen />, { wrapper: Wrapper });
    expect(screen.getByTestId('competition-builder-title')).toHaveTextContent(
      'Nouvelle compétition',
    );
  });

  it('refuse la sauvegarde sans nom', () => {
    render(<CompetitionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('competition-save'));
    expect(screen.getByTestId('competition-builder-validation')).toHaveTextContent(/nom/i);
    expect(mockCreateCompetition).not.toHaveBeenCalled();
  });

  it('refuse la sauvegarde sans date de début (sélecteur non renseigné, TLX-197)', () => {
    // Le sélecteur de date interdit désormais une saisie malformée ; reste le cas « vide ».
    render(<CompetitionBuilderScreen now={NOW} />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('competition-field-name'), 'Meeting');
    fireEvent.press(screen.getByTestId('competition-save'));
    expect(screen.getByTestId('competition-builder-validation')).toHaveTextContent(/début/i);
    expect(mockCreateCompetition).not.toHaveBeenCalled();
  });

  it('refuse une date de fin antérieure au début', () => {
    render(<CompetitionBuilderScreen now={NOW} />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('competition-field-name'), 'Meeting');
    pickDate('competition-field-start', '2026-07-03');
    pickDate('competition-field-end', '2026-07-01');
    fireEvent.press(screen.getByTestId('competition-save'));
    expect(screen.getByTestId('competition-builder-validation')).toHaveTextContent(/fin/i);
    expect(mockCreateCompetition).not.toHaveBeenCalled();
  });

  it('crée puis enchaîne sur l’engagement', async () => {
    mockCreateCompetition.mockResolvedValue({ status: 201, data: { id: 'k-9' } });
    render(<CompetitionBuilderScreen now={NOW} />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('competition-field-name'), 'Meeting de printemps');
    pickDate('competition-field-start', '2026-07-01');
    fireEvent.press(screen.getByTestId('competition-save'));

    await waitFor(() => expect(mockCreateCompetition).toHaveBeenCalled());
    const body = mockCreateCompetition.mock.calls[0][0];
    expect(body).toMatchObject({ name: 'Meeting de printemps', startDate: '2026-07-01' });
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(coach)/competition/[id]/engage',
        params: expect.objectContaining({ id: 'k-9' }),
      }),
    );
  });
});
