import { ThemeProvider } from '@talent-x/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CalendarView } from './CalendarView';
import type { CalendarEntry } from './calendar-model';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

const NOW = new Date('2026-05-14T09:00:00Z'); // jeudi → semaine du 11 mai

const ENTRIES: CalendarEntry[] = [
  {
    id: 'e-1',
    kind: 'assignment',
    title: 'Sprint 60m',
    date: '2026-05-12',
    tone: 'accent',
    statusLabel: 'À faire',
  },
  {
    id: 'e-2',
    kind: 'assignment',
    title: 'Récupération',
    date: '2026-05-14',
    tone: 'success',
    statusLabel: 'Réalisée',
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

describe('CalendarView (TLX-100)', () => {
  it('place chaque entrée sur son jour et affiche « Repos » ailleurs', () => {
    render(
      <CalendarView entries={ENTRIES} now={NOW} onPressEntry={jest.fn()} testIDPrefix="cal" />,
      {
        wrapper: Wrapper,
      },
    );
    expect(screen.getByText('Semaine du 11 mai')).toBeOnTheScreen();
    expect(screen.getByText('Sprint 60m')).toBeOnTheScreen();
    expect(screen.getByText('Récupération')).toBeOnTheScreen();
    // Un jour sans entrée porte « Repos ».
    expect(screen.getAllByText('Repos').length).toBeGreaterThan(0);
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

  it('déclenche onPressEntry au tap', () => {
    const onPress = jest.fn();
    render(<CalendarView entries={ENTRIES} now={NOW} onPressEntry={onPress} testIDPrefix="cal" />, {
      wrapper: Wrapper,
    });
    fireEvent.press(screen.getByTestId('cal-entry-e-1'));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'e-1' }));
  });

  it('navigue de semaine et masque les entrées hors fenêtre', () => {
    render(
      <CalendarView entries={ENTRIES} now={NOW} onPressEntry={jest.fn()} testIDPrefix="cal" />,
      {
        wrapper: Wrapper,
      },
    );
    fireEvent.press(screen.getByTestId('cal-week-next'));
    expect(screen.getByText('Semaine du 18 mai')).toBeOnTheScreen();
    expect(screen.queryByTestId('cal-entry-e-1')).toBeNull(); // 12 mai hors fenêtre
    // Retour à la semaine courante.
    fireEvent.press(screen.getByTestId('cal-today'));
    expect(screen.getByText('Semaine du 11 mai')).toBeOnTheScreen();
    expect(screen.getByTestId('cal-entry-e-1')).toBeOnTheScreen();
  });

  it("ne montre pas le retour « aujourd'hui » sur la semaine courante", () => {
    render(
      <CalendarView entries={ENTRIES} now={NOW} onPressEntry={jest.fn()} testIDPrefix="cal" />,
      {
        wrapper: Wrapper,
      },
    );
    expect(screen.queryByTestId('cal-today')).toBeNull();
  });
});
