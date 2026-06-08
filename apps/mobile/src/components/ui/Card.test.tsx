import { type ReactNode } from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { Card } from './Card';

const wrap = (children: ReactNode) => <ThemeProvider>{children}</ThemeProvider>;

describe('Card (TLX-006)', () => {
  it('affiche son contenu', () => {
    render(
      wrap(
        <Card>
          <Text>Contenu</Text>
        </Card>,
      ),
    );
    expect(screen.getByText('Contenu')).toBeOnTheScreen();
  });

  it('devient pressable avec onPress', () => {
    const onPress = jest.fn();
    render(
      wrap(
        <Card onPress={onPress} accessibilityLabel="carte">
          <Text>Contenu</Text>
        </Card>,
      ),
    );
    fireEvent.press(screen.getByLabelText('carte'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
