import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockCreateManualRecord = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  createManualRecord: (...a: unknown[]) => mockCreateManualRecord(...a),
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
}));
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { ManualRecordEditor } from './ManualRecordEditor';

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

beforeEach(() => jest.clearAllMocks());

describe('ManualRecordEditor (TLX-116 / ADR-32)', () => {
  it('replié par défaut puis ouvre le formulaire', () => {
    render(<ManualRecordEditor />, { wrapper: Wrapper });
    expect(screen.queryByTestId('manual-record-form')).toBeNull();
    fireEvent.press(screen.getByTestId('manual-record-open'));
    expect(screen.getByTestId('manual-record-form')).toBeOnTheScreen();
  });

  it('famille chronométrée : champ distance + envoi du payload composé', async () => {
    mockCreateManualRecord.mockResolvedValue({ status: 200, data: {} });
    render(<ManualRecordEditor />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('manual-record-open'));

    // sprint est la famille par défaut → champ distance présent.
    fireEvent.changeText(screen.getByTestId('manual-distance'), '60');
    fireEvent.changeText(screen.getByTestId('manual-value'), '7,45'); // virgule normalisée
    fireEvent.press(screen.getByTestId('manual-submit'));

    await waitFor(() =>
      expect(mockCreateManualRecord).toHaveBeenCalledWith({
        family: 'sprint',
        value: 7.45,
        distanceMeters: 60,
      }),
    );
  });

  it('change de famille → paramètre contextuel adapté (throws → poids d’engin)', () => {
    render(<ManualRecordEditor />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('manual-record-open'));
    fireEvent.press(screen.getByTestId('manual-family-throws'));
    expect(screen.getByTestId('manual-implement')).toBeOnTheScreen();
    expect(screen.queryByTestId('manual-distance')).toBeNull();
  });

  it('vertical : discipline + payload ; jumps : sans paramètre', async () => {
    mockCreateManualRecord.mockResolvedValue({ status: 200, data: {} });
    render(<ManualRecordEditor />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('manual-record-open'));

    fireEvent.press(screen.getByTestId('manual-family-vertical'));
    fireEvent.press(screen.getByTestId('manual-discipline-pole'));
    fireEvent.changeText(screen.getByTestId('manual-value'), '5.10');
    fireEvent.press(screen.getByTestId('manual-submit'));

    await waitFor(() =>
      expect(mockCreateManualRecord).toHaveBeenCalledWith({
        family: 'vertical',
        value: 5.1,
        discipline: 'pole',
      }),
    );
  });

  it('submit désactivé tant que la marque (ou le paramètre requis) manque', () => {
    render(<ManualRecordEditor />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('manual-record-open'));
    // sprint sans distance ni valeur → pas d'appel au press.
    fireEvent.press(screen.getByTestId('manual-submit'));
    expect(mockCreateManualRecord).not.toHaveBeenCalled();
  });
});
