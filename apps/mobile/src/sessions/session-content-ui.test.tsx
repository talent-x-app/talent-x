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
    expect(screen.getByTestId('exercise-1')).toHaveTextContent(/A1 · Squat/);
    expect(screen.getByTestId('exercise-2')).toHaveTextContent(/A2 · Bonds/);
    // Compteur de feuilles (1 simple + 2 membres), sans perf → pas de fraction.
    expect(screen.getByTestId('exercise-count')).toHaveTextContent(/Exercices · 3/);
    // Pas de saisie : aucune case « Tour k » ni bouton de soumission.
    expect(screen.queryByTestId('exercise-1-round-0')).toBeNull();
    expect(screen.queryByTestId('submit-performance')).toBeNull();
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

    // Échauffement sans perf → non réalisé ; Squat 2/3 tours ; Bonds mesuré.
    expect(screen.getByTestId('exercise-1-realized')).toHaveTextContent('2/3 tours');
    expect(screen.getByTestId('exercise-2-realized')).toHaveTextContent('2.4 m');
    // 2 feuilles réalisées sur 3 (Squat + Bonds).
    expect(screen.getByTestId('exercise-count')).toHaveTextContent(/2\/3/);
  });
});
