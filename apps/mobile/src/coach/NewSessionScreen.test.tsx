import { ThemeProvider } from '@talent-x/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';

const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  BlockType: {
    sprint: 'sprint',
    hurdles: 'hurdles',
    endurance: 'endurance',
    jumps: 'jumps',
    throws: 'throws',
  },
  SessionStatus: { draft: 'draft', published: 'published', template: 'template' },
  // Importé transitivement via navigation.ts → athlete-ui.
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, back: mockBack }) }));

import { NewSessionScreen } from './NewSessionScreen';
import { DISCIPLINES } from './discipline-assistants';

function Wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

beforeEach(() => jest.clearAllMocks());

describe('NewSessionScreen — choix de discipline (ADR-38, TLX-154)', () => {
  it('affiche le titre et les 5 cartes de discipline + l’option Personnalisé', () => {
    render(<NewSessionScreen />, { wrapper: Wrapper });
    expect(screen.getByTestId('new-session-title')).toHaveTextContent('Nouvelle séance');
    for (const d of DISCIPLINES) {
      expect(screen.getByTestId(`new-session-discipline-${d.key}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId('new-session-custom')).toBeOnTheScreen();
  });

  it('tap sur une discipline → navigue vers son assistant (replace : sélecteur transitoire)', () => {
    render(<NewSessionScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('new-session-discipline-sprint'));
    // `replace` (pas `push`) : le sélecteur sort de l'historique (TLX-198 — nav post-création).
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(coach)/session/assistant/[discipline]',
      params: { discipline: 'sprint' },
    });
  });

  it('tap sur Haies → assistant haies (clé de discipline correcte)', () => {
    render(<NewSessionScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('new-session-discipline-hurdles'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(coach)/session/assistant/[discipline]',
      params: { discipline: 'hurdles' },
    });
  });

  it('tap sur Composer une séance → constructeur (mode=custom, replace)', () => {
    render(<NewSessionScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('new-session-custom'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(coach)/session/new',
      params: { mode: 'custom' },
    });
  });

  it('tap retour → router.back', () => {
    render(<NewSessionScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('new-session-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
