import '@testing-library/react-native/extend-expect';
import { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { Chip } from './Chip';

const wrap = (children: ReactNode) => <ThemeProvider>{children}</ThemeProvider>;

describe('Chip (TLX-006)', () => {
  it('affiche le libellé et déclenche onPress', () => {
    const onPress = jest.fn();
    render(wrap(<Chip onPress={onPress}>Sprint</Chip>));
    expect(screen.getByText('Sprint')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('expose l’état sélectionné', () => {
    render(
      wrap(
        <Chip onPress={() => {}} selected>
          Sprint
        </Chip>,
      ),
    );
    expect(screen.getByRole('button')).toBeSelected();
  });
});
