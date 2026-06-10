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

  it('refuse une date de début mal formée', () => {
    render(<CompetitionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('competition-field-name'), 'Meeting');
    fireEvent.changeText(screen.getByTestId('competition-field-start'), '01/07/2026');
    fireEvent.press(screen.getByTestId('competition-save'));
    expect(screen.getByTestId('competition-builder-validation')).toHaveTextContent(/début/i);
    expect(mockCreateCompetition).not.toHaveBeenCalled();
  });

  it('refuse une date de fin antérieure au début', () => {
    render(<CompetitionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('competition-field-name'), 'Meeting');
    fireEvent.changeText(screen.getByTestId('competition-field-start'), '2026-07-03');
    fireEvent.changeText(screen.getByTestId('competition-field-end'), '2026-07-01');
    fireEvent.press(screen.getByTestId('competition-save'));
    expect(screen.getByTestId('competition-builder-validation')).toHaveTextContent(/fin/i);
    expect(mockCreateCompetition).not.toHaveBeenCalled();
  });

  it('crée puis enchaîne sur l’engagement', async () => {
    mockCreateCompetition.mockResolvedValue({ status: 201, data: { id: 'k-9' } });
    render(<CompetitionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('competition-field-name'), 'Meeting de printemps');
    fireEvent.changeText(screen.getByTestId('competition-field-start'), '2026-07-01');
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
