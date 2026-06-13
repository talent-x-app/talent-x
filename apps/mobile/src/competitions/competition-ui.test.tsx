import { CompetitionEntryStatus, CompetitionStatus, type Competition } from '@talent-x/api-client';
import { ThemeProvider } from '@talent-x/design-tokens';
import { render, screen } from '@testing-library/react-native';
import { CompetitionListItem, formatCompetitionPeriod } from './competition-ui';

const BASE: Competition = {
  id: 'c-1',
  coachId: 'coach-1',
  name: 'Meeting de printemps',
  startDate: '2026-07-01',
  status: CompetitionStatus.published,
};

function renderItem(competition: Competition) {
  return render(
    <ThemeProvider>
      <CompetitionListItem competition={competition} />
    </ThemeProvider>,
  );
}

describe('CompetitionListItem — badge (TLX-92)', () => {
  it('affiche le statut de la compétition quand pas de statut d’engagement (coach)', () => {
    renderItem(BASE);
    expect(screen.getByTestId('competition-status-published')).toHaveTextContent('Publiée');
    expect(screen.queryByTestId('entry-status-engaged')).toBeNull();
  });

  it('affiche le statut d’engagement de l’athlète quand présent', () => {
    renderItem({ ...BASE, viewerEntryStatus: CompetitionEntryStatus.engaged });
    expect(screen.getByTestId('entry-status-engaged')).toHaveTextContent('Engagé');
    // Le statut de la compétition est masqué au profit de l'engagement.
    expect(screen.queryByTestId('competition-status-published')).toBeNull();
  });

  it('affiche « Confirmé » pour un engagement confirmé', () => {
    renderItem({ ...BASE, viewerEntryStatus: CompetitionEntryStatus.confirmed });
    expect(screen.getByTestId('entry-status-confirmed')).toHaveTextContent('Confirmé');
  });
});

describe('formatCompetitionPeriod (ADR-24)', () => {
  it('un seul jour quand pas de date de fin', () => {
    expect(formatCompetitionPeriod('2026-07-01')).toBe('1 juil. 2026');
  });

  it('un seul jour quand début = fin', () => {
    expect(formatCompetitionPeriod('2026-07-01', '2026-07-01')).toBe('1 juil. 2026');
  });

  it('plage début → fin', () => {
    expect(formatCompetitionPeriod('2026-07-01', '2026-07-03')).toBe('1 → 3 juil. 2026');
  });

  it('accepte un instant ISO complet (jour calendaire, UTC)', () => {
    expect(formatCompetitionPeriod('2026-07-01T00:00:00.000Z')).toBe('1 juil. 2026');
  });

  it('chaîne vide si la date de début est illisible', () => {
    expect(formatCompetitionPeriod('')).toBe('');
    expect(formatCompetitionPeriod('pas-une-date')).toBe('');
  });
});
