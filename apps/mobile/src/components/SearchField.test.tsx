import { ThemeProvider } from '@talent-x/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';
import { SearchField } from './SearchField';

function Wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

/** Hôte contrôlé pour observer la valeur. */
function Host() {
  const [v, setV] = useState('');
  return <SearchField testID="sf" value={v} onChangeText={setV} placeholder="Chercher" />;
}

describe('SearchField (TLX-117)', () => {
  it('saisit du texte et affiche le bouton d’effacement qui vide le champ', () => {
    render(<Host />, { wrapper: Wrapper });
    const input = screen.getByTestId('sf');

    // Pas de bouton clear quand vide.
    expect(screen.queryByTestId('sf-clear')).toBeNull();

    fireEvent.changeText(input, 'sprint');
    expect(input.props.value).toBe('sprint');
    expect(screen.getByTestId('sf-clear')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('sf-clear'));
    expect(input.props.value).toBe('');
    expect(screen.queryByTestId('sf-clear')).toBeNull();
  });
});
