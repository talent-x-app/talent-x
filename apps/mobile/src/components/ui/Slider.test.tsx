import '@testing-library/react-native/extend-expect';
import { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { Slider } from './Slider';

const wrap = (children: ReactNode) => <ThemeProvider>{children}</ThemeProvider>;

describe('Slider (TLX-006)', () => {
  it('expose la valeur courante (RPE 1..10)', () => {
    render(wrap(<Slider testID="rpe" value={5} min={1} max={10} onValueChange={() => {}} />));
    expect(screen.getByTestId('rpe')).toHaveAccessibilityValue({ min: 1, max: 10, now: 5 });
  });

  it('incrémente via l’action d’accessibilité', () => {
    const onValueChange = jest.fn();
    render(wrap(<Slider testID="rpe" value={5} min={1} max={10} onValueChange={onValueChange} />));
    fireEvent(screen.getByTestId('rpe'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onValueChange).toHaveBeenCalledWith(6);
  });

  it('borne la valeur au maximum', () => {
    const onValueChange = jest.fn();
    render(wrap(<Slider testID="rpe" value={10} min={1} max={10} onValueChange={onValueChange} />));
    fireEvent(screen.getByTestId('rpe'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onValueChange).toHaveBeenCalledWith(10);
  });
});
