import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListSessions = jest.fn();
const mockDuplicateSession = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listSessions: (...a: unknown[]) => mockListSessions(...a),
  duplicateSession: (...a: unknown[]) => mockDuplicateSession(...a),
  SessionStatus: {
    draft: 'draft',
    published: 'published',
    archived: 'archived',
    template: 'template',
  },
  // Importé transitivement via navigation.ts → athlete-ui.
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur', description: undefined }),
}));

import { CoachTemplatesScreen } from './CoachTemplatesScreen';

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

const template = (over: Record<string, unknown> = {}) => ({
  id: 't-1',
  coachId: 'me',
  title: 'Séance type sprint',
  status: 'template',
  exercises: { schemaVersion: 3, items: [{ name: 'Sprint' }, { name: 'Gainage' }] },
  ...over,
});

const page = (items: unknown[]) => ({
  status: 200,
  data: { data: items, meta: { total: items.length, page: 1, limit: 20 } },
});

beforeEach(() => jest.clearAllMocks());

describe('CoachTemplatesScreen (C-10, TLX-064)', () => {
  it('liste les modèles via status=template', async () => {
    mockListSessions.mockResolvedValue(page([template()]));
    render(<CoachTemplatesScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('template-item-t-1')).toBeOnTheScreen());
    expect(mockListSessions).toHaveBeenCalledWith({ status: 'template' });
    expect(screen.getByText('Séance type sprint')).toBeOnTheScreen();
    expect(screen.getByText('2 exercices')).toBeOnTheScreen();
  });

  it('« Créer un modèle » ouvre le constructeur en mode modèle', async () => {
    mockListSessions.mockResolvedValue(page([]));
    render(<CoachTemplatesScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('templates-empty')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('template-create'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(coach)/session/new',
        params: { status: 'template' },
      }),
    );
  });

  it('tap sur une carte ouvre le modèle en édition', async () => {
    mockListSessions.mockResolvedValue(page([template()]));
    render(<CoachTemplatesScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('template-item-t-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('template-item-t-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(coach)/session/[id]/edit', params: { id: 't-1' } }),
    );
  });

  it('« Utiliser ce modèle » duplique puis ouvre la copie (brouillon) en édition', async () => {
    mockListSessions.mockResolvedValue(page([template()]));
    mockDuplicateSession.mockResolvedValue({
      status: 201,
      data: { id: 's-copy', status: 'draft' },
    });
    render(<CoachTemplatesScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('template-use-t-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('template-use-t-1'));

    await waitFor(() => expect(mockDuplicateSession).toHaveBeenCalledWith('t-1'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(coach)/session/[id]/edit',
          params: { id: 's-copy' },
        }),
      ),
    );
  });

  it('état vide quand aucun modèle', async () => {
    mockListSessions.mockResolvedValue(page([]));
    render(<CoachTemplatesScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('templates-empty')).toBeOnTheScreen());
  });

  it('état erreur + réessai', async () => {
    mockListSessions.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CoachTemplatesScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('templates-error')).toBeOnTheScreen());

    mockListSessions.mockResolvedValueOnce(page([template()]));
    fireEvent.press(screen.getByTestId('templates-retry'));
    await waitFor(() => expect(screen.getByTestId('template-item-t-1')).toBeOnTheScreen());
  });
});
