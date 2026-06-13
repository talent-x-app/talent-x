import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetPreferences = jest.fn();
const mockUpdatePreferences = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getNotificationPreferences: (...a: unknown[]) => mockGetPreferences(...a),
  updateNotificationPreferences: (...a: unknown[]) => mockUpdatePreferences(...a),
}));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur', description: 'réessaie' }),
}));

import { NotificationPreferencesSection } from './NotificationPreferencesSection';

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

const DEFAULTS = {
  sessionAssigned: true,
  performanceFeedback: true,
  performanceSubmitted: true,
  groupUpdates: true,
  marketing: false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NotificationPreferencesSection (TLX-111 — ADR-22)', () => {
  it('affiche les interrupteurs (dont « Performance à revoir ») aux valeurs du serveur', async () => {
    mockGetPreferences.mockResolvedValue({ status: 200, data: DEFAULTS });
    render(<NotificationPreferencesSection />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('notification-pref-sessionAssigned')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('notification-pref-sessionAssigned').props.value).toBe(true);
    expect(screen.getByTestId('notification-pref-performanceSubmitted').props.value).toBe(true);
    expect(screen.getByTestId('notification-pref-marketing').props.value).toBe(false);
  });

  it('bascule « Performance à revoir » → PUT partiel performanceSubmitted (TLX-139)', async () => {
    mockGetPreferences.mockResolvedValue({ status: 200, data: DEFAULTS });
    mockUpdatePreferences.mockResolvedValue({
      status: 200,
      data: { ...DEFAULTS, performanceSubmitted: false },
    });
    render(<NotificationPreferencesSection />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('notification-pref-performanceSubmitted')).toBeOnTheScreen(),
    );

    fireEvent(screen.getByTestId('notification-pref-performanceSubmitted'), 'valueChange', false);

    await waitFor(() =>
      expect(mockUpdatePreferences).toHaveBeenCalledWith({ performanceSubmitted: false }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('notification-pref-performanceSubmitted').props.value).toBe(false),
    );
  });

  it('bascule un interrupteur → PUT partiel + bascule optimiste', async () => {
    mockGetPreferences.mockResolvedValue({ status: 200, data: DEFAULTS });
    mockUpdatePreferences.mockResolvedValue({
      status: 200,
      data: { ...DEFAULTS, sessionAssigned: false },
    });
    render(<NotificationPreferencesSection />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('notification-pref-sessionAssigned')).toBeOnTheScreen(),
    );

    fireEvent(screen.getByTestId('notification-pref-sessionAssigned'), 'valueChange', false);

    await waitFor(() =>
      expect(mockUpdatePreferences).toHaveBeenCalledWith({ sessionAssigned: false }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('notification-pref-sessionAssigned').props.value).toBe(false),
    );
  });

  it('échec du PUT → rollback + toast', async () => {
    mockGetPreferences.mockResolvedValue({ status: 200, data: DEFAULTS });
    mockUpdatePreferences.mockResolvedValue({ status: 500, data: {} });
    render(<NotificationPreferencesSection />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('notification-pref-marketing')).toBeOnTheScreen(),
    );

    fireEvent(screen.getByTestId('notification-pref-marketing'), 'valueChange', true);

    await waitFor(() => expect(mockShow).toHaveBeenCalled());
    expect(screen.getByTestId('notification-pref-marketing').props.value).toBe(false);
  });
});
