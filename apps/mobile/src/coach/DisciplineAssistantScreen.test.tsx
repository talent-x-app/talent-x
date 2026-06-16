import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockCreateSession = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  createSession: (...a: unknown[]) => mockCreateSession(...a),
  getSession: jest.fn(),
  updateSession: jest.fn(),
  SessionStatus: {
    draft: 'draft',
    published: 'published',
    archived: 'archived',
    template: 'template',
  },
  LoadUnit: { kg: 'kg', lb: 'lb', percent_1rm: 'percent_1rm', bodyweight: 'bodyweight' },
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
  BlockType: {
    strength: 'strength',
    interval: 'interval',
    sprint: 'sprint',
    endurance: 'endurance',
    hurdles: 'hurdles',
    jumps: 'jumps',
    vertical_jumps: 'vertical_jumps',
    throws: 'throws',
    core: 'core',
    warmup: 'warmup',
    cooldown: 'cooldown',
    custom: 'custom',
  },
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    useRouter: () => ({ back: mockBack, replace: mockReplace, push: mockPush }),
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { DisciplineAssistantScreen } from './DisciplineAssistantScreen';

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

describe('DisciplineAssistantScreen — Sprint (ADR-38, TLX-155)', () => {
  it('rend le titre dédié + les presets Sprint + une série amorcée', () => {
    render(<DisciplineAssistantScreen discipline="sprint" />, { wrapper: Wrapper });
    expect(screen.getByTestId('session-builder-title')).toHaveTextContent('Assistant Sprint');
    expect(screen.getByTestId('assistant-presets')).toBeOnTheScreen();
    expect(screen.getByTestId('assistant-preset-max_velocity')).toBeOnTheScreen();
    // ADR-39 : Sprint rend le canvas d'effort dédié (pas l'éditeur de blocs générique).
    expect(screen.getByTestId('sprint-effort-canvas')).toBeOnTheScreen();
    // La seed comprend 1 carte de série + barres Échauffement / RAC.
    expect(screen.getByTestId('series-card-0')).toBeOnTheScreen();
    expect(screen.getByTestId('warmup-bar')).toBeOnTheScreen();
    expect(screen.getByTestId('cooldown-bar')).toBeOnTheScreen();
  });

  it("ADR-39 : le canvas d'effort édite les params et sérialise vers /sessions", async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's3', title: 'Carte' } });
    render(<DisciplineAssistantScreen discipline="sprint" />, { wrapper: Wrapper });

    // Seed : [warmup, série(60m 95% blocks rounds=1 restR=300s), cooldown]
    // Édition via le canvas (1 carte de série = 1 EditableGroup).
    fireEvent.changeText(screen.getByTestId('series-card-0-sprint-0-dist'), '80'); // distance 80 m
    fireEvent.changeText(screen.getByTestId('series-card-0-sprint-0-int'), '90'); // intensité 90 %
    fireEvent.press(screen.getByTestId('series-card-0-rounds-inc')); // séries 1 → 2
    fireEvent.press(screen.getByTestId('series-card-0-start-standing')); // départ Debout
    fireEvent.changeText(screen.getByTestId('series-card-0-restR'), '6'); // récup R 6 min = 360 s

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Carte sprint');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const body = mockCreateSession.mock.calls[0][0];
    // nodes = [warmup, série, cooldown] → items[1] = groupe sprint
    const group = body.exercises.items[1];
    expect(group.kind).toBe('group');
    expect(group.groupType).toBe('series');
    expect(group.rounds).toBe(2);
    expect(group.restBetweenRoundsSeconds).toBe(360);
    expect(group.items[0]).toMatchObject({
      type: 'sprint',
      params: {
        distanceMeters: 80,
        reps: 1,
        recoverySeconds: 240,
        startType: 'standing',
        intensityMode: 'percent_record',
        intensityValue: 90,
      },
    });
  });

  it('applique un preset puis crée une séance Sprint multi-séries (POST /sessions)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's1', title: 'Vitesse' } });
    render(<DisciplineAssistantScreen discipline="sprint" />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('assistant-preset-max_velocity'));
    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Vitesse max — mardi');
    fireEvent.press(screen.getByTestId('session-status-published'));
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const body = mockCreateSession.mock.calls[0][0];
    expect(body.title).toBe('Vitesse max — mardi');
    expect(body.status).toBe('published');
    expect(body.exercises.schemaVersion).toBe(3);

    // Après preset, les nodes = [seriesA, seriesB] (sans warmup/cooldown — preset reset les nodes).
    const group = body.exercises.items[0];
    expect(group.kind).toBe('group');
    expect(group.groupType).toBe('series');
    expect(group.rounds).toBe(2);
    expect(group.restBetweenRoundsSeconds).toBe(600);
    expect(group.items).toHaveLength(2);
    expect(group.items[0]).toMatchObject({
      type: 'sprint',
      params: {
        distanceMeters: 60,
        intensityMode: 'percent_record',
        intensityValue: 100,
        startType: 'flying',
        flyingZone: true,
      },
    });
  });

  it.each([
    ['hurdles', 'Assistant Haies'],
    ['endurance', 'Assistant Demi-fond / Endurance'],
    ['jumps', 'Assistant Sauts'],
    ['throws', 'Assistant Lancers'],
  ])("rend l'assistant %s avec son titre + ses presets", (discipline, title) => {
    render(<DisciplineAssistantScreen discipline={discipline} />, { wrapper: Wrapper });
    expect(screen.getByTestId('session-builder-title')).toHaveTextContent(title);
    expect(screen.getByTestId('assistant-presets')).toBeOnTheScreen();
  });

  it('Haies : applique un preset → POST /sessions type hurdles, distance dérivée', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's2', title: 'Haies' } });
    render(<DisciplineAssistantScreen discipline="hurdles" />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('assistant-preset-h110'));
    fireEvent.changeText(screen.getByTestId('session-field-title'), '110 m haies');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const body = mockCreateSession.mock.calls[0][0];
    const effort = body.exercises.items[0].items[0];
    expect(effort.type).toBe('hurdles');
    expect(effort.params.distanceMeters).toBe(110);
  });

  it('discipline inconnue → retombe sur le constructeur générique vierge', () => {
    render(<DisciplineAssistantScreen discipline="bogus" />, { wrapper: Wrapper });
    expect(screen.getByTestId('session-builder-title')).toHaveTextContent('Nouvelle séance');
    expect(screen.queryByTestId('assistant-presets')).toBeNull();
  });
});
