import { ThemeProvider } from '@talent-x/design-tokens';
import { render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import {
  BlockType,
  type Exercise,
  type ExerciseGroup,
  type ExerciseResult,
} from '@talent-x/api-client';
import { SessionContent } from './session-content-ui';

function Wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

const ex = (over: Partial<Exercise> & { name: string; order: number }): Exercise => ({
  type: BlockType.custom,
  ...over,
});

const group = (over: Partial<ExerciseGroup> & { items: Exercise[] }): ExerciseGroup => ({
  kind: 'group',
  name: over.name ?? 'Bloc',
  order: over.order ?? 1,
  rounds: over.rounds ?? 1,
  ...over,
});

describe('SessionContent (lecture seule)', () => {
  const exercises = [
    ex({ name: 'Échauffement', order: 0, type: BlockType.warmup }),
    group({
      name: 'Contraste',
      order: 1,
      groupType: 'superset',
      rounds: 3,
      restBetweenRoundsSeconds: 180,
      items: [
        ex({ name: 'Squat', order: 1, type: BlockType.strength, sets: 3, reps: 3 }),
        ex({ name: 'Bonds', order: 2, type: BlockType.custom }),
      ],
    }),
  ];

  it('rend les en-têtes de groupe (N tours · R) et les membres A1/A2, sans cases de saisie', () => {
    render(<SessionContent exercises={exercises} />, { wrapper: Wrapper });

    expect(screen.getByTestId('group-0-rounds')).toHaveTextContent('3 tours · R 180s');
    // L'échauffement est une phase (encart), exclu de la liste d'exercices (TLX-171).
    expect(screen.getByTestId('session-phase-warmup')).toHaveTextContent('Échauffement');
    expect(screen.getByTestId('exercise-0')).toHaveTextContent(/A1 · Squat/);
    expect(screen.getByTestId('exercise-1')).toHaveTextContent(/A2 · Bonds/);
    // Compteur de feuilles : 2 membres (échauffement non compté).
    expect(screen.getByTestId('exercise-count')).toHaveTextContent(/Exercices · 2/);
    // Pas de saisie : aucune case « Tour k » ni bouton de soumission.
    expect(screen.queryByTestId('exercise-0-round-0')).toBeNull();
    expect(screen.queryByTestId('submit-performance')).toBeNull();
  });

  it('affiche la synthèse de séance (phrase + KPIs) pour une séance en séries (TLX-160)', () => {
    const sprintSession = [
      group({
        name: 'Vitesse',
        order: 1,
        groupType: 'series',
        rounds: 2,
        items: [
          ex({ name: '30 m', order: 1, type: BlockType.sprint, params: { distanceMeters: 30 } }),
          ex({ name: '60 m', order: 2, type: BlockType.sprint, params: { distanceMeters: 60 } }),
        ],
      }),
    ];
    render(<SessionContent exercises={sprintSession} />, { wrapper: Wrapper });
    expect(screen.getByTestId('session-phrase')).toHaveTextContent('2 × (30·60 m)');
    expect(screen.getByTestId('session-kpi-efforts')).toHaveTextContent('4');
    expect(screen.getByTestId('session-kpi-volume')).toHaveTextContent('180 m');
  });

  it('masque la synthèse si aucune mesure exploitable (dégradation propre)', () => {
    render(<SessionContent exercises={[ex({ name: 'Renforcement', order: 1 })]} />, {
      wrapper: Wrapper,
    });
    expect(screen.queryByTestId('session-phrase')).toBeNull();
    // KPI efforts reste possible (1 effort) mais pas de volume.
    expect(screen.queryByTestId('session-kpi-volume')).toBeNull();
  });

  it('affiche les notes d’un bloc — échauffement/RAC sans params (TLX-170)', () => {
    const withNotes = [
      ex({
        name: 'Échauffement',
        order: 1,
        type: BlockType.warmup,
        notes: 'Footing 12′ · gammes (4×2×30 m) · 3 lignes droites',
      }),
      group({
        name: 'Circuit PPG',
        order: 2,
        groupType: 'circuit',
        rounds: 3,
        notes: 'Enchaîner les stations sans relâcher le gainage',
        items: [ex({ name: 'Gainage', order: 1, type: BlockType.core })],
      }),
    ];
    render(<SessionContent exercises={withNotes} />, { wrapper: Wrapper });

    // L'échauffement est un encart de phase (TLX-171) ; son contenu (notes, TLX-170) est visible.
    expect(screen.getByTestId('session-phase-warmup-notes')).toHaveTextContent(
      'Footing 12′ · gammes (4×2×30 m) · 3 lignes droites',
    );
    // La consigne du groupe est rendue sous l'en-tête.
    expect(screen.getByTestId('group-0-notes')).toHaveTextContent(
      'Enchaîner les stations sans relâcher le gainage',
    );
  });

  it('n’affiche pas de ligne de notes quand le bloc n’en a pas', () => {
    render(<SessionContent exercises={[ex({ name: 'Squat', order: 1 })]} />, { wrapper: Wrapper });
    expect(screen.queryByTestId('exercise-0-notes')).toBeNull();
  });

  it('affiche les mesures relues + compteur réalisés quand une perf est fournie', () => {
    const results: ExerciseResult[] = [
      {
        exerciseName: 'Squat',
        order: 1,
        setResults: [
          { set: 1, completed: true },
          { set: 2, completed: false },
          { set: 3, completed: true },
        ],
      },
      {
        exerciseName: 'Bonds',
        order: 2,
        setResults: [{ set: 1, distanceMeters: 2.4, completed: true }],
      },
    ];
    render(<SessionContent exercises={exercises} results={results} />, { wrapper: Wrapper });

    // L'échauffement (phase) n'est plus une feuille ; Squat=feuille 0, Bonds=feuille 1.
    expect(screen.getByTestId('exercise-0-realized')).toHaveTextContent('2/3 tours');
    expect(screen.getByTestId('exercise-1-realized')).toHaveTextContent('2.4 m');
    // 2 feuilles réalisées sur 2 (Squat + Bonds) — l'échauffement n'est pas compté.
    expect(screen.getByTestId('exercise-count')).toHaveTextContent(/2\/2/);
  });
});
