import '@testing-library/react-native/extend-expect';
import { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { Button } from './Button';

const wrap = (children: ReactNode) => <ThemeProvider>{children}</ThemeProvider>;

describe('Button (TLX-006)', () => {
  it('affiche le libellé', () => {
    render(wrap(<Button onPress={() => {}}>Valider</Button>));
    expect(screen.getByText('Valider')).toBeOnTheScreen();
  });

  it('déclenche onPress au tap', () => {
    const onPress = jest.fn();
    render(wrap(<Button onPress={onPress}>Valider</Button>));
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ne déclenche pas onPress quand disabled', () => {
    const onPress = jest.fn();
    render(
      wrap(
        <Button onPress={onPress} disabled>
          Valider
        </Button>,
      ),
    );
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('expose l’état busy quand loading', () => {
    render(
      wrap(
        <Button onPress={() => {}} loading>
          Valider
        </Button>,
      ),
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeBusy();
    expect(btn).toBeDisabled();
  });
});
