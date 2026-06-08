import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { Button } from '../components/ui';
import { ToastProvider, useToast } from './ToastProvider';
import { emitToast } from './toast-bridge';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function Trigger() {
  const { show } = useToast();
  return <Button onPress={() => show({ title: 'Enregistré', variant: 'success' })}>Go</Button>;
}

const renderWithProvider = (children: React.ReactNode) =>
  render(
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>,
  );

describe('ToastProvider (TLX-010)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('affiche un toast via useToast().show', () => {
    renderWithProvider(<Trigger />);
    fireEvent.press(screen.getByText('Go'));
    expect(screen.getByText('Enregistré')).toBeOnTheScreen();
  });

  it('rejette automatiquement après la durée par défaut', () => {
    jest.useFakeTimers();
    renderWithProvider(<Trigger />);
    fireEvent.press(screen.getByText('Go'));
    expect(screen.getByText('Enregistré')).toBeOnTheScreen();

    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Enregistré')).toBeNull();
  });

  it('rejette au tap sur le toast', () => {
    renderWithProvider(<Trigger />);
    fireEvent.press(screen.getByText('Go'));
    fireEvent.press(screen.getByTestId('toast-success'));
    expect(screen.queryByText('Enregistré')).toBeNull();
  });

  it('relaie les toasts émis par le pont hors-React (emitToast)', () => {
    renderWithProvider(<Text>contenu</Text>);
    act(() => {
      emitToast({ title: 'Synchronisation échouée', variant: 'danger' });
    });
    expect(screen.getByText('Synchronisation échouée')).toBeOnTheScreen();
  });

  it('lève une erreur si useToast est utilisé hors provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow('useToast must be used within ToastProvider');
    spy.mockRestore();
  });
});
