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

  /**
   * Mode **édition** (TLX-254) : il n'était couvert par aucun test, alors qu'il porte la
   * moitié de l'écran — chargement, hydratation du formulaire, mise à jour, statut,
   * suppression, et les deux états d'échec. Un coach qui corrige une compétition passe
   * intégralement par ce chemin ; c'est aussi celui qu'ADR-58 a fini par protéger.
   */
  describe('mode édition', () => {
    const COMPETITION = {
      id: 'k-1',
      name: 'Championnats régionaux',
      discipline: 'Sprint',
      location: 'Lyon',
      startDate: '2026-07-10',
      endDate: '2026-07-12',
      description: 'Sur deux jours',
      status: 'published',
    };

    it('charge puis hydrate le formulaire avec la compétition existante', async () => {
      mockGetCompetition.mockResolvedValue({ status: 200, data: COMPETITION });
      render(<CompetitionBuilderScreen competitionId="k-1" now={NOW} />, { wrapper: Wrapper });

      expect(screen.getByTestId('competition-builder-loading')).toBeOnTheScreen();

      await waitFor(() =>
        expect(screen.getByTestId('competition-field-name').props.value).toBe(
          'Championnats régionaux',
        ),
      );
      expect(screen.getByTestId('competition-field-discipline').props.value).toBe('Sprint');
      expect(screen.getByTestId('competition-field-location').props.value).toBe('Lyon');
      expect(screen.getByTestId('competition-field-description').props.value).toBe(
        'Sur deux jours',
      );
      expect(screen.getByTestId('competition-builder-title')).not.toHaveTextContent(
        'Nouvelle compétition',
      );
    });

    it('champs optionnels absents : le formulaire s’hydrate sans « undefined »', async () => {
      mockGetCompetition.mockResolvedValue({
        status: 200,
        data: {
          id: 'k-2',
          name: 'Meeting sec',
          startDate: '2026-07-10',
          status: 'draft',
        },
      });
      render(<CompetitionBuilderScreen competitionId="k-2" now={NOW} />, { wrapper: Wrapper });

      await waitFor(() =>
        expect(screen.getByTestId('competition-field-name').props.value).toBe('Meeting sec'),
      );
      expect(screen.getByTestId('competition-field-discipline').props.value).toBe('');
      expect(screen.getByTestId('competition-field-location').props.value).toBe('');
      expect(screen.getByTestId('competition-field-description').props.value).toBe('');
    });

    it('enregistre la correction et revient en arrière (pas d’enchaînement sur l’engagement)', async () => {
      mockGetCompetition.mockResolvedValue({ status: 200, data: COMPETITION });
      mockUpdateCompetition.mockResolvedValue({ status: 200, data: COMPETITION });
      render(<CompetitionBuilderScreen competitionId="k-1" now={NOW} />, { wrapper: Wrapper });
      await waitFor(() =>
        expect(screen.getByTestId('competition-field-name').props.value).toBe(
          'Championnats régionaux',
        ),
      );

      fireEvent.changeText(screen.getByTestId('competition-field-location'), 'Grenoble');
      fireEvent.press(screen.getByTestId('competition-save'));

      await waitFor(() => expect(mockUpdateCompetition).toHaveBeenCalled());
      const [id, body] = mockUpdateCompetition.mock.calls[0];
      expect(id).toBe('k-1');
      expect(body).toMatchObject({ name: 'Championnats régionaux', location: 'Grenoble' });
      // Corriger n'est pas créer : on revient d'où l'on vient, sans passer par l'engagement.
      expect(mockBack).toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockCreateCompetition).not.toHaveBeenCalled();
    });

    it('changer le statut est envoyé avec la mise à jour', async () => {
      mockGetCompetition.mockResolvedValue({ status: 200, data: COMPETITION });
      mockUpdateCompetition.mockResolvedValue({ status: 200, data: COMPETITION });
      render(<CompetitionBuilderScreen competitionId="k-1" now={NOW} />, { wrapper: Wrapper });
      await waitFor(() =>
        expect(screen.getByTestId('competition-field-name').props.value).toBe(
          'Championnats régionaux',
        ),
      );

      fireEvent.press(screen.getByTestId('competition-status-cancelled'));
      fireEvent.press(screen.getByTestId('competition-save'));

      await waitFor(() => expect(mockUpdateCompetition).toHaveBeenCalled());
      expect(mockUpdateCompetition.mock.calls[0][1]).toMatchObject({ status: 'cancelled' });
    });

    it('échec de l’enregistrement : toast d’erreur, l’écran ne navigue pas', async () => {
      mockGetCompetition.mockResolvedValue({ status: 200, data: COMPETITION });
      mockUpdateCompetition.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
      render(<CompetitionBuilderScreen competitionId="k-1" now={NOW} />, { wrapper: Wrapper });
      await waitFor(() =>
        expect(screen.getByTestId('competition-field-name').props.value).toBe(
          'Championnats régionaux',
        ),
      );

      fireEvent.press(screen.getByTestId('competition-save'));

      await waitFor(() =>
        expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' })),
      );
      // Le coach reste sur son formulaire : sa saisie n'est pas perdue par une navigation.
      expect(mockBack).not.toHaveBeenCalled();
      expect(screen.getByTestId('competition-field-name')).toBeOnTheScreen();
    });

    it('supprimer la compétition : DELETE puis retour', async () => {
      mockGetCompetition.mockResolvedValue({ status: 200, data: COMPETITION });
      mockDeleteCompetition.mockResolvedValue({ status: 204 });
      render(<CompetitionBuilderScreen competitionId="k-1" now={NOW} />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByTestId('competition-delete')).toBeOnTheScreen());

      fireEvent.press(screen.getByTestId('competition-delete'));

      await waitFor(() => expect(mockDeleteCompetition).toHaveBeenCalledWith('k-1'));
      await waitFor(() => expect(mockBack).toHaveBeenCalled());
    });

    it('échec de la suppression : toast d’erreur, la compétition reste à l’écran', async () => {
      mockGetCompetition.mockResolvedValue({ status: 200, data: COMPETITION });
      mockDeleteCompetition.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
      render(<CompetitionBuilderScreen competitionId="k-1" now={NOW} />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByTestId('competition-delete')).toBeOnTheScreen());

      fireEvent.press(screen.getByTestId('competition-delete'));

      await waitFor(() =>
        expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' })),
      );
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('chargement en échec : carte d’erreur et « Réessayer » relance la requête', async () => {
      mockGetCompetition.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
      render(<CompetitionBuilderScreen competitionId="k-1" now={NOW} />, { wrapper: Wrapper });

      await waitFor(() =>
        expect(screen.getByTestId('competition-builder-error')).toBeOnTheScreen(),
      );
      const callsBefore = mockGetCompetition.mock.calls.length;

      fireEvent.press(screen.getByTestId('competition-builder-retry'));

      await waitFor(() =>
        expect(mockGetCompetition.mock.calls.length).toBeGreaterThan(callsBefore),
      );
    });
  });
});
