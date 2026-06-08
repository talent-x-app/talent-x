import { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { Toast } from './Toast';

const wrap = (children: ReactNode) => <ThemeProvider>{children}</ThemeProvider>;

describe('Toast (TLX-010)', () => {
  it('affiche titre et description', () => {
    render(wrap(<Toast title="Séance enregistrée" description="Athlète notifié" />));
    expect(screen.getByText('Séance enregistrée')).toBeOnTheScreen();
    expect(screen.getByText('Athlète notifié')).toBeOnTheScreen();
  });

  it('expose un label d’accessibilité combinant titre et description', () => {
    render(wrap(<Toast title="Erreur" description="Réessayer" variant="danger" />));
    expect(screen.getByLabelText('Erreur. Réessayer')).toBeOnTheScreen();
  });

  it('appelle onDismiss au tap', () => {
    const onDismiss = jest.fn();
    render(wrap(<Toast title="Coucou" onDismiss={onDismiss} testID="t" />));
    fireEvent.press(screen.getByTestId('t'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
