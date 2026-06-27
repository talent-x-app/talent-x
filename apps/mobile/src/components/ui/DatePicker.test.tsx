import { ThemeProvider } from '@talent-x/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';
import { DatePicker } from './DatePicker';

function Wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

/** Hôte contrôlé : reflète la valeur émise par le picker (comme un écran réel). */
function Host({ initial = '', now }: { initial?: string; now?: Date }) {
  const [value, setValue] = useState(initial);
  return <DatePicker testID="dp" value={value} onChange={setValue} now={now} />;
}

const NOW = new Date('2026-06-15T00:00:00');

describe('DatePicker (TLX-197)', () => {
  it('est fermé par défaut et n’affiche pas la grille', () => {
    render(<Host now={NOW} />, { wrapper: Wrapper });
    expect(screen.getByTestId('dp')).toBeOnTheScreen();
    expect(screen.queryByTestId('dp-period')).toBeNull();
  });

  it('ouvre sur le mois de `now` quand aucune valeur, et sélectionne un jour', () => {
    render(<Host now={NOW} />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('dp'));
    expect(screen.getByTestId('dp-period')).toHaveTextContent(/juin 2026/i);
    fireEvent.press(screen.getByTestId('dp-cell-2026-06-20'));
    // Sélection → grille refermée + jour marqué sélectionné à la réouverture.
    expect(screen.queryByTestId('dp-period')).toBeNull();
    fireEvent.press(screen.getByTestId('dp'));
    expect(screen.getByTestId('dp-cell-2026-06-20').props.accessibilityState.selected).toBe(true);
  });

  it('navigue de mois en mois', () => {
    render(<Host now={NOW} />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('dp'));
    fireEvent.press(screen.getByTestId('dp-next'));
    expect(screen.getByTestId('dp-period')).toHaveTextContent(/juillet 2026/i);
    fireEvent.press(screen.getByTestId('dp-prev'));
    fireEvent.press(screen.getByTestId('dp-prev'));
    expect(screen.getByTestId('dp-period')).toHaveTextContent(/mai 2026/i);
  });

  it('ouvre sur le mois de la valeur fournie', () => {
    render(<Host initial="2026-09-10" now={NOW} />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('dp'));
    expect(screen.getByTestId('dp-period')).toHaveTextContent(/septembre 2026/i);
  });

  it('efface la valeur via la croix', () => {
    render(<Host initial="2026-06-20" now={NOW} />, { wrapper: Wrapper });
    expect(screen.getByTestId('dp-clear')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('dp-clear'));
    // Valeur vidée → plus de bouton d'effacement.
    expect(screen.queryByTestId('dp-clear')).toBeNull();
  });
});
