import { ThemeProvider } from '@talent-x/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CalendarView } from './CalendarView';
import type { CalendarEntry } from './calendar-model';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

const NOW = new Date('2026-05-14T09:00:00Z'); // jeudi 14 mai → jour sélectionné par défaut

const ENTRIES: CalendarEntry[] = [
  {
    id: 'e-1',
    kind: 'session',
    title: 'Sprint 60m',
    date: '2026-05-12',
    tone: 'accent',
    statusLabel: 'Publiée',
  },
  {
    id: 'e-2',
    kind: 'session',
    title: 'Récupération',
    date: '2026-05-14',
    tone: 'success',
    statusLabel: 'Publiée',
  },
  {
    id: 'e-undated',
    kind: 'session',
    title: 'Séance libre',
    date: null,
    tone: 'neutral',
    statusLabel: 'Brouillon',
  },
];

describe('CalendarView (TLX-100 / ADR-47 — Mois ⇄ Semaine)', () => {
  it('mois par défaut : grille + jour sélectionné (aujourd’hui) montre ses entrées', () => {
    render(
      <CalendarView entries={ENTRIES} now={NOW} onPressEntry={jest.fn()} testIDPrefix="cal" />,
      {
        wrapper: Wrapper,
      },
    );
    expect(screen.getByTestId('cal-period')).toBeOnTheScreen();
    // Grille du mois : une cellule par jour (y compris débordements).
    expect(screen.getByTestId('cal-cell-2026-05-04')).toBeOnTheScreen();
    // 14 mai sélectionné par défaut → son entrée s'affiche.
    expect(screen.getByText('Récupération')).toBeOnTheScreen();
  });

  it('sélectionner un jour affiche ses entrées, et le tap remonte au parent', () => {
    const onPress = jest.fn();
    render(<CalendarView entries={ENTRIES} now={NOW} onPressEntry={onPress} testIDPrefix="cal" />, {
      wrapper: Wrapper,
    });
    fireEvent.press(screen.getByTestId('cal-cell-2026-05-12'));
    expect(screen.getByText('Sprint 60m')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('cal-entry-e-1'));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'e-1' }));
  });

  it('liste les entrées sans date dans la section « Sans date »', () => {
    render(
      <CalendarView entries={ENTRIES} now={NOW} onPressEntry={jest.fn()} testIDPrefix="cal" />,
      {
        wrapper: Wrapper,
      },
    );
    expect(screen.getByText('Sans date')).toBeOnTheScreen();
    expect(screen.getByTestId('cal-undated-e-undated')).toBeOnTheScreen();
    expect(screen.getByText('Séance libre')).toBeOnTheScreen();
  });

  it('bascule Mois ⇄ Semaine : la semaine ne montre que ses 7 jours', () => {
    render(
      <CalendarView entries={ENTRIES} now={NOW} onPressEntry={jest.fn()} testIDPrefix="cal" />,
      {
        wrapper: Wrapper,
      },
    );
    // En mois, le 4 mai (semaine précédente) est dans la grille.
    expect(screen.getByTestId('cal-cell-2026-05-04')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('cal-mode-week'));
    // En semaine (11→17 mai), le 14 reste, le 4 sort.
    expect(screen.getByTestId('cal-cell-2026-05-14')).toBeOnTheScreen();
    expect(screen.queryByTestId('cal-cell-2026-05-04')).toBeNull();
  });

  it('TLX-195 : sépare « Brouillons » de « Sans date »', () => {
    const entries: CalendarEntry[] = [
      {
        id: 'd-1',
        kind: 'session',
        title: 'Brouillon X',
        date: null,
        tone: 'neutral',
        statusLabel: 'Brouillon',
        isDraft: true,
      },
      {
        id: 'u-1',
        kind: 'session',
        title: 'Publiée non datée',
        date: null,
        tone: 'accent',
        statusLabel: 'Publiée',
      },
    ];
    render(
      <CalendarView entries={entries} now={NOW} onPressEntry={jest.fn()} testIDPrefix="cal" />,
      {
        wrapper: Wrapper,
      },
    );
    expect(screen.getByText('Brouillons')).toBeOnTheScreen();
    expect(screen.getByTestId('cal-draft-d-1')).toBeOnTheScreen();
    expect(screen.getByText('Sans date')).toBeOnTheScreen();
    expect(screen.getByTestId('cal-undated-u-1')).toBeOnTheScreen();
  });

  it('TLX-195 : badge « En retard » sur une entrée en retard du jour sélectionné', () => {
    const entries: CalendarEntry[] = [
      {
        id: 'o-1',
        kind: 'session',
        title: 'En retard',
        date: '2026-05-14', // jour sélectionné par défaut (NOW)
        tone: 'accent',
        statusLabel: 'Publiée',
        overdue: true,
      },
    ];
    render(
      <CalendarView entries={entries} now={NOW} onPressEntry={jest.fn()} testIDPrefix="cal" />,
      {
        wrapper: Wrapper,
      },
    );
    expect(screen.getByTestId('cal-entry-o-1-overdue')).toBeOnTheScreen();
  });

  it('navigation de période : « Aujourd’hui » resélectionne le jour courant', () => {
    render(
      <CalendarView entries={ENTRIES} now={NOW} onPressEntry={jest.fn()} testIDPrefix="cal" />,
      {
        wrapper: Wrapper,
      },
    );
    fireEvent.press(screen.getByTestId('cal-nav-next')); // mois suivant
    fireEvent.press(screen.getByTestId('cal-today'));
    // De retour sur le mois courant : le 14 mai et son entrée sont là.
    expect(screen.getByTestId('cal-cell-2026-05-14')).toBeOnTheScreen();
    expect(screen.getByText('Récupération')).toBeOnTheScreen();
  });
});
