import { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { Stepper } from './Stepper';

const wrap = (children: ReactNode) => <ThemeProvider>{children}</ThemeProvider>;

describe('Stepper (ADR-39)', () => {
  it('affiche la valeur et incrémente / décrémente du pas', () => {
    const onChange = jest.fn();
    render(wrap(<Stepper testID="reps" value={3} step={1} onValueChange={onChange} />));
    expect(screen.getByTestId('reps-value')).toHaveTextContent('3');

    fireEvent.press(screen.getByTestId('reps-inc'));
    expect(onChange).toHaveBeenLastCalledWith(4);

    fireEvent.press(screen.getByTestId('reps-dec'));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('respecte les bornes min / max (pas d’émission au-delà)', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      wrap(<Stepper testID="s" value={1} min={1} max={2} onValueChange={onChange} />),
    );
    // À la borne basse : décrémenter n'émet rien.
    fireEvent.press(screen.getByTestId('s-dec'));
    expect(onChange).not.toHaveBeenCalled();

    rerender(wrap(<Stepper testID="s" value={2} min={1} max={2} onValueChange={onChange} />));
    // À la borne haute : incrémenter n'émet rien.
    fireEvent.press(screen.getByTestId('s-inc'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applique le format d’affichage (ex. « % »)', () => {
    render(
      wrap(
        <Stepper
          testID="pct"
          value={95}
          step={5}
          format={(v) => `${v} %`}
          onValueChange={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId('pct-value')).toHaveTextContent('95 %');
  });

  it('ne fait rien quand disabled', () => {
    const onChange = jest.fn();
    render(wrap(<Stepper testID="d" value={3} disabled onValueChange={onChange} />));
    fireEvent.press(screen.getByTestId('d-inc'));
    fireEvent.press(screen.getByTestId('d-dec'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
