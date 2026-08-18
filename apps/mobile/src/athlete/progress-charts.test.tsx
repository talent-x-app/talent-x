import type { PersonalRecord, Progress, ProgressSeries } from '@talent-x/api-client';
import { ThemeProvider } from '@talent-x/design-tokens';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import {
  ProgressExplorer,
  ProgressMetricsRow,
  ProgressSeriesCard,
  RecordRow,
} from './progress-charts';
import type { ProgressWindow } from './progress-series';

/**
 * Composants de progression & records (A-06/A-07, ADR-56) — partagés athlète et coach.
 *
 * Purement présentationnels : aucune requête, donc aucun mock du client API n'est nécessaire
 * (les types sont importés en `import type`, effacés à la compilation).
 *
 * Le **tracé SVG** n'est rendu qu'une fois la largeur mesurée (`onLayout`). Les tests qui le
 * visent doivent donc déclencher la mesure — sans quoi on ne teste que la moitié de la frise,
 * celle qui ne dessine rien.
 */

function Wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

/** Largeur plausible d'écran : `onLayout` ne se déclenche pas dans un rendu de test. */
function measure(eventKey: string, width = 320): void {
  fireEvent(screen.getByTestId(`progress-chart-area-${eventKey}`), 'layout', {
    nativeEvent: { layout: { width, height: 132, x: 0, y: 0 } },
  });
}

const SPRINT: ProgressSeries = {
  eventKey: 'sprint:60m',
  label: '60 m',
  unit: 's',
  direction: 'min',
  points: [
    { date: '2026-06-02', value: 7.8 },
    // Journée à plusieurs marques : alimente le panneau « Détail du jour ».
    { date: '2026-06-12', value: 7.6, others: [7.72, 7.9] },
    { date: '2026-06-26', value: 7.45 },
  ],
  seasonBest: { date: '2026-06-26', value: 7.45 },
  marksByYear: [{ year: 2026, best: 7.45, count: 3 }],
};

const LONGUEUR: ProgressSeries = {
  eventKey: 'jumps:long',
  label: 'Longueur',
  unit: 'm',
  direction: 'max',
  points: [
    { date: '2026-06-05', value: 5.9 },
    { date: '2026-06-20', value: 6.25 },
  ],
  marksByYear: [],
};

function seriesOf(eventKey: string, over: Partial<ProgressSeries> = {}): ProgressSeries {
  return { ...SPRINT, eventKey, ...over };
}

function renderCard(series: ProgressSeries, window: ProgressWindow = 'month') {
  // `range: null` = « tout l'historique » : les fixtures restent lisibles et déterministes,
  // sans dépendre de la date d'exécution des tests.
  return render(<ProgressSeriesCard series={series} window={window} range={null} />, {
    wrapper: Wrapper,
  });
}

describe('ProgressMetricsRow', () => {
  const metrics: Progress['metrics'] = {
    assignmentsTotal: 4,
    completed: 3,
    missed: 1,
    skipped: 0,
    completionRate: 0.75,
    avgRpe: 7.2,
  };

  it('affiche réalisées, assiduité arrondie et RPE moyen', () => {
    render(<ProgressMetricsRow progress={{ athleteId: 'a-1', metrics, series: [] }} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText('3/4')).toBeOnTheScreen();
    expect(screen.getByText('75 %')).toBeOnTheScreen();
    expect(screen.getByText('7.2')).toBeOnTheScreen();
  });

  it('RPE absent : tiret plutôt qu’un zéro trompeur', () => {
    render(
      <ProgressMetricsRow
        progress={{ athleteId: 'a-1', metrics: { ...metrics, avgRpe: undefined }, series: [] }}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('—')).toBeOnTheScreen();
  });
});

describe('RecordRow', () => {
  const record: PersonalRecord = {
    id: 'r-1',
    athleteId: 'a-1',
    eventKey: 'sprint:60m',
    label: '60 m',
    value: 7.45,
    unit: 's',
    direction: 'min',
    achievedAt: '2026-06-26',
    performanceId: 'p-1',
  };

  it('affiche la valeur formatée et le SB de la saison', () => {
    render(<RecordRow record={record} seasonBest={{ date: '2026-06-26', value: 7.45 }} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByTestId('record-sprint:60m-value')).toHaveTextContent('7.45 s');
    expect(screen.getByTestId('record-sprint:60m-sb')).toHaveTextContent('SB 2026 · 7.45 s');
  });

  it('sans SB : la ligne SB disparaît (rien d’inventé)', () => {
    render(<RecordRow record={record} />, { wrapper: Wrapper });

    expect(screen.getByTestId('record-sprint:60m')).toBeOnTheScreen();
    expect(screen.queryByTestId('record-sprint:60m-sb')).toBeNull();
  });

  it('record déclaré à la main : mention « manuel » (traçabilité de l’origine)', () => {
    render(<RecordRow record={{ ...record, performanceId: undefined }} />, { wrapper: Wrapper });

    expect(screen.getByText(/manuel/)).toBeOnTheScreen();
  });
});

describe('ProgressSeriesCard — en-tête', () => {
  it('dernière marque, tendance et nombre de marques', () => {
    renderCard(SPRINT);

    expect(screen.getByTestId('progress-last-sprint:60m')).toHaveTextContent('7.45 s');
    // Sens `min` : le chrono baisse → progression.
    expect(screen.getByTestId('progress-trend-sprint:60m-up')).toBeOnTheScreen();
    expect(screen.getByText('3 marques sur la période')).toBeOnTheScreen();
  });

  it('une seule marque : singulier, et ni tendance ni delta', () => {
    renderCard(seriesOf('sprint:100m', { points: [{ date: '2026-06-02', value: 11.2 }] }));

    expect(screen.getByText('1 marque sur la période')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-delta-sprint:100m')).toBeNull();
  });

  it('sens `max` : une distance qui augmente est une progression', () => {
    renderCard(LONGUEUR);

    expect(screen.getByTestId('progress-trend-jumps:long-up')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-last-jumps:long')).toHaveTextContent('6.25 m');
  });

  it('régression : tendance à la baisse et delta non amélioré', () => {
    renderCard(
      seriesOf('sprint:200m', {
        points: [
          { date: '2026-06-02', value: 23.1 },
          { date: '2026-06-20', value: 23.6 },
        ],
      }),
    );

    expect(screen.getByTestId('progress-trend-sprint:200m-down')).toBeOnTheScreen();
    // Assertion sur le `Text` et non sur le bandeau : ce dernier contient aussi l'icône de sens,
    // dont la concaténation ajoute un blanc invisible qui ferait échouer `toHaveTextContent`.
    const delta = screen.getByTestId('progress-delta-sprint:200m');
    expect(within(delta).getByText('0.5 s')).toBeOnTheScreen();
  });

  it('valeur inchangée : aucun bandeau de delta (0 n’est pas une information)', () => {
    renderCard(
      seriesOf('sprint:300m', {
        points: [
          { date: '2026-06-02', value: 38.4 },
          { date: '2026-06-20', value: 38.4 },
        ],
      }),
    );

    expect(screen.queryByTestId('progress-delta-sprint:300m')).toBeNull();
  });

  it('période sans marque : message explicite, pas de graphe vide', () => {
    renderCard(seriesOf('sprint:400m', { points: [], marksByYear: [] }));

    expect(screen.getByTestId('progress-series-sprint:400m-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-chart-area-sprint:400m')).toBeNull();
  });

  it('saison & carrière : SB de l’année et ligne par année (ADR-34)', () => {
    renderCard(SPRINT);

    expect(screen.getByTestId('progress-sb-sprint:60m')).toHaveTextContent('7.45 s · 2026');
    const ligne = screen.getByTestId('progress-year-sprint:60m-2026');
    expect(within(ligne).getByText('7.45 s')).toBeOnTheScreen();
  });

  // La pastille de discipline est le repère visuel quand plusieurs cartes défilent :
  // chaque famille doit produire la sienne, `interval`/`vertical` étant regroupées.
  it.each([
    ['sprint:60m'],
    ['hurdles:110mH'],
    ['endurance:3000m'],
    ['interval:400m'],
    ['jumps:long'],
    ['vertical:high'],
    ['throws:shot'],
    ['inconnu:truc'],
  ])('pastille de discipline rendue pour %s', (eventKey) => {
    renderCard(seriesOf(eventKey));

    expect(screen.getByTestId(`progress-discipline-${eventKey}`)).toBeOnTheScreen();
  });
});

describe('ProgressSeriesCard — frise et tracé', () => {
  it('le tracé SVG n’apparaît qu’une fois la largeur mesurée', () => {
    renderCard(SPRINT);

    // Avant mesure : la zone existe, le tracé non (largeur nulle).
    expect(screen.getByTestId('progress-chart-area-sprint:60m')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-chart-sprint:60m')).toBeNull();

    measure('sprint:60m');

    expect(screen.getByTestId('progress-chart-sprint:60m')).toBeOnTheScreen();
  });

  it('marque unique : tracé rendu sans courbe ni aire', () => {
    renderCard(seriesOf('sprint:100m', { points: [{ date: '2026-06-02', value: 11.2 }] }));
    measure('sprint:100m');

    expect(screen.getByTestId('progress-chart-sprint:100m')).toBeOnTheScreen();
    // Marque unique → ni axe de dates ni bandeau de marques.
    expect(screen.queryByTestId('progress-mark-sprint:100m-0')).toBeNull();
  });

  it('forte densité : les pastilles se raréfient, la frise reste lisible', () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      value: 8 - i * 0.02,
    }));
    renderCard(seriesOf('sprint:60m', { points }), 'month');
    measure('sprint:60m');

    expect(screen.getByTestId('progress-chart-sprint:60m')).toBeOnTheScreen();
    // Le bandeau, lui, garde toutes les marques : c'est le « journal ».
    expect(screen.getByTestId('progress-mark-sprint:60m-19')).toBeOnTheScreen();
  });

  it('taper le bandeau sélectionne la marque et met à jour le détail du jour', () => {
    renderCard(SPRINT);

    fireEvent.press(screen.getByTestId('progress-mark-sprint:60m-1'));

    const detail = screen.getByTestId('progress-day-detail-sprint:60m');
    expect(within(detail).getByText(/12 juin/)).toBeOnTheScreen();
    // La journée porte 3 marques (la meilleure + `others`).
    expect(within(detail).getByText('3 marques')).toBeOnTheScreen();
  });

  it('taper le graphe sélectionne la marque la plus proche du doigt', () => {
    renderCard(SPRINT);
    measure('sprint:60m');

    // Extrême gauche → première marque, quelle que soit la sélection initiale (la dernière).
    fireEvent.press(screen.getByTestId('progress-hit-sprint:60m'), {
      nativeEvent: { locationX: 0 },
    });

    expect(
      within(screen.getByTestId('progress-day-detail-sprint:60m')).getByText(/2 juin/),
    ).toBeOnTheScreen();
  });

  it('graphe non mesuré : le tap est ignoré plutôt que de sélectionner au hasard', () => {
    renderCard(SPRINT);

    fireEvent.press(screen.getByTestId('progress-hit-sprint:60m'), {
      nativeEvent: { locationX: 0 },
    });

    // Sélection inchangée : toujours la dernière marque.
    expect(
      within(screen.getByTestId('progress-day-detail-sprint:60m')).getByText(/26 juin/),
    ).toBeOnTheScreen();
  });

  it('la sélection par défaut est la dernière marque', () => {
    renderCard(SPRINT);

    expect(
      within(screen.getByTestId('progress-day-detail-sprint:60m')).getByText(/26 juin/),
    ).toBeOnTheScreen();
  });
});

describe('ProgressExplorer', () => {
  const SERIES = [SPRINT, LONGUEUR, seriesOf('sprint:100m', { label: '100 m' })];
  const NOW = new Date('2026-06-28T12:00:00.000Z');

  function renderExplorer(series = SERIES) {
    return render(<ProgressExplorer series={series} now={NOW} />, { wrapper: Wrapper });
  }

  it('ouvre sur l’épreuve la plus récente, en focus direct', () => {
    renderExplorer();

    // 60 m porte la marque la plus récente (26/06) → sa discipline est sélectionnée.
    expect(screen.getByTestId('progress-series-sprint:60m')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-series-jumps:long')).toBeNull();
  });

  it('« Toutes » retombe sur la liste complète', () => {
    renderExplorer();

    fireEvent.press(screen.getByTestId('progress-discipline-all'));

    expect(screen.getByTestId('progress-series-sprint:60m')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-series-jumps:long')).toBeOnTheScreen();
  });

  it('changer de discipline repart sur sa vue d’ensemble', () => {
    renderExplorer();

    fireEvent.press(screen.getByTestId('progress-discipline-tab-jumps'));

    expect(screen.getByTestId('progress-series-jumps:long')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-series-sprint:60m')).toBeNull();
  });

  it('les pills d’épreuve n’apparaissent qu’à partir de deux épreuves', () => {
    renderExplorer();

    // Sprint en compte deux (60 m et 100 m).
    fireEvent.press(screen.getByTestId('progress-discipline-tab-sprint'));
    expect(screen.getByTestId('progress-event-all')).toBeOnTheScreen();

    // Sauts n'en a qu'une : aucune pill à choisir.
    fireEvent.press(screen.getByTestId('progress-discipline-tab-jumps'));
    expect(screen.queryByTestId('progress-event-all')).toBeNull();
  });

  it('choisir une épreuve isole sa carte', () => {
    renderExplorer();

    fireEvent.press(screen.getByTestId('progress-discipline-tab-sprint'));
    fireEvent.press(screen.getByTestId('progress-event-sprint:100m'));

    expect(screen.getByTestId('progress-series-sprint:100m')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-series-sprint:60m')).toBeNull();
  });

  it('navigation de période : reculer puis revenir', () => {
    renderExplorer();

    expect(screen.getByTestId('progress-period-label')).toHaveTextContent(/juin/);

    fireEvent.press(screen.getByTestId('progress-period-prev'));
    expect(screen.getByTestId('progress-period-label')).toHaveTextContent(/mai/);

    fireEvent.press(screen.getByTestId('progress-period-next'));
    expect(screen.getByTestId('progress-period-label')).toHaveTextContent(/juin/);
  });

  it('impossible d’aller au-delà de la période courante', () => {
    renderExplorer();

    fireEvent.press(screen.getByTestId('progress-period-next'));

    // Le futur n'existe pas encore : le libellé ne bouge pas.
    expect(screen.getByTestId('progress-period-label')).toHaveTextContent(/juin/);
  });

  it('changer de granularité ramène à la période courante', () => {
    renderExplorer();

    fireEvent.press(screen.getByTestId('progress-period-prev'));
    expect(screen.getByTestId('progress-period-label')).toHaveTextContent(/mai/);

    fireEvent.press(screen.getByTestId('progress-window-year'));

    expect(screen.getByTestId('progress-period-label')).toHaveTextContent('2026');
  });

  it('« Tout » masque la navigation de période', () => {
    renderExplorer();

    fireEvent.press(screen.getByTestId('progress-window-all'));

    expect(screen.queryByTestId('progress-period-label')).toBeNull();
    expect(screen.queryByTestId('progress-period-prev')).toBeNull();
  });

  it('sans aucune série : ni onglet de discipline ni carte', () => {
    renderExplorer([]);

    expect(screen.getByTestId('progress-discipline-all')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-series-sprint:60m')).toBeNull();
  });
});
