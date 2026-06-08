import '@testing-library/react-native/extend-expect';
import { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { Input } from './Input';

const wrap = (children: ReactNode) => <ThemeProvider>{children}</ThemeProvider>;

describe('Input (TLX-006)', () => {
  it('affiche le label et la valeur', () => {
    render(wrap(<Input label="Email" value="a@b.dev" onChangeText={() => {}} />));
    expect(screen.getByText('Email')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('a@b.dev')).toBeOnTheScreen();
  });

  it('relaie la saisie via onChangeText', () => {
    const onChangeText = jest.fn();
    render(wrap(<Input label="Email" value="" onChangeText={onChangeText} placeholder="email" />));
    fireEvent.changeText(screen.getByPlaceholderText('email'), 'x@y.dev');
    expect(onChangeText).toHaveBeenCalledWith('x@y.dev');
  });

  it('affiche le message d’erreur', () => {
    render(wrap(<Input value="" onChangeText={() => {}} error="Email invalide" />));
    expect(screen.getByText('Email invalide')).toBeOnTheScreen();
  });
});
