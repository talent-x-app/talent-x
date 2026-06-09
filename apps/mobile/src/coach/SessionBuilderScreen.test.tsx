import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockCreateSession = jest.fn();
const mockGetSession = jest.fn();
const mockUpdateSession = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  createSession: (...a: unknown[]) => mockCreateSession(...a),
  getSession: (...a: unknown[]) => mockGetSession(...a),
  updateSession: (...a: unknown[]) => mockUpdateSession(...a),
  SessionStatus: { draft: 'draft', published: 'published', archived: 'archived' },
  LoadUnit: { kg: 'kg', lb: 'lb', percent_1rm: 'percent_1rm', bodyweight: 'bodyweight' },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { SessionBuilderScreen } from './SessionBuilderScreen';

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

describe('SessionBuilderScreen (TLX-052 — C-05)', () => {
  it('rend le mode création avec un bloc vide', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    expect(screen.getByTestId('session-builder-title')).toHaveTextContent('Nouvelle séance');
    expect(screen.getByTestId('block-0')).toBeOnTheScreen();
    expect(screen.queryByTestId('block-1')).toBeNull();
  });

  it('refuse la sauvegarde sans titre', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('session-save'));
    expect(screen.getByTestId('session-builder-validation')).toHaveTextContent(/titre/i);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('refuse la sauvegarde si un bloc est sans nom', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Vitesse');
    fireEvent.press(screen.getByTestId('session-save'));
    expect(screen.getByTestId('session-builder-validation')).toHaveTextContent(/bloc 1/i);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('ajoute et supprime des blocs', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('session-add-block'));
    expect(screen.getByTestId('block-1')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('block-1-remove'));
    expect(screen.queryByTestId('block-1')).toBeNull();
  });

  it('crée une séance avec le document exercises v1 (order, nombres, charge)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-new' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), '  Vitesse — départs  ');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Squat arrière');
    fireEvent.changeText(screen.getByTestId('block-0-sets'), '5');
    fireEvent.changeText(screen.getByTestId('block-0-reps'), '3');
    fireEvent.changeText(screen.getByTestId('block-0-load'), '80');
    fireEvent.press(screen.getByTestId('block-0-unit-kg'));
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    expect(mockCreateSession).toHaveBeenCalledWith({
      title: 'Vitesse — départs',
      description: undefined,
      scheduledDate: undefined,
      status: 'draft',
      exercises: {
        schemaVersion: 2,
        items: [
          {
            name: 'Squat arrière',
            order: 1,
            sets: 5,
            reps: 3,
            load: { value: 80, unit: 'kg' },
          },
        ],
      },
    });
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  it("n'attache pas de charge si l'unité n'est pas choisie", async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-new' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Endurance');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Footing');
    fireEvent.changeText(screen.getByTestId('block-0-load'), '80'); // valeur sans unité
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const body = mockCreateSession.mock.calls[0][0];
    expect(body.exercises.items[0]).not.toHaveProperty('load');
  });

  it('charge une séance existante puis la met à jour (PUT)', async () => {
    mockGetSession.mockResolvedValue({
      status: 200,
      data: {
        id: 's-1',
        title: 'Force max',
        status: 'published',
        coachId: 'c-1',
        exercises: {
          schemaVersion: 1,
          items: [{ name: 'Développé', order: 1, sets: 4, reps: 2 }],
        },
      },
    });
    mockUpdateSession.mockResolvedValue({ status: 200, data: { id: 's-1' } });
    render(<SessionBuilderScreen sessionId="s-1" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('session-builder-title')).toHaveTextContent('Modifier la séance'),
    );
    expect(screen.getByTestId('block-0-name').props.value).toBe('Développé');

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Force max v2');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockUpdateSession).toHaveBeenCalled());
    const [id, body] = mockUpdateSession.mock.calls[0];
    expect(id).toBe('s-1');
    expect(body.title).toBe('Force max v2');
    expect(body.exercises.items[0].name).toBe('Développé');
  });

  it('état erreur si la séance à éditer ne charge pas', async () => {
    mockGetSession.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    render(<SessionBuilderScreen sessionId="s-x" />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('session-builder-error')).toBeOnTheScreen());
  });
});
