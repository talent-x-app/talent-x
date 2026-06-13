import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockSubmit = jest.fn();
const mockUpdate = jest.fn();
const mockShow = jest.fn();
let mockOnline = true;

jest.mock('@talent-x/api-client', () => ({
  submitPerformance: (...a: unknown[]) => mockSubmit(...a),
  updatePerformance: (...a: unknown[]) => mockUpdate(...a),
}));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  useNetworkStatus: () => mockOnline,
}));
// Trousseau en mémoire (deviceStore → secure-storage → expo-secure-store).
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

import * as SecureStore from 'expo-secure-store';
import { deviceStore } from './key-value-store';
import { saveDraft } from './perf-draft';
import { enqueuePerf, loadOutbox, type OutboxItem } from './perf-outbox';
import { OfflineSync, sendPerfItem } from './useOfflineSync';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

function item(assignmentId: string, kind: OutboxItem['kind'] = 'submit'): OutboxItem {
  return {
    assignmentId,
    kind,
    body: { results: { schemaVersion: 2, items: [] }, rpe: 7 },
    idempotencyKey: `perf-${assignmentId}`,
    queuedAt: '2026-06-13T10:00:00.000Z',
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  store.clear();
  mockOnline = true;
});

describe('sendPerfItem (mapping HTTP → issue de flush)', () => {
  it('submit 201 → sent, avec l’en-tête Idempotency-Key', async () => {
    mockSubmit.mockResolvedValue({ status: 201, data: { id: 'p-1' } });
    expect(await sendPerfItem(item('as-1', 'submit'))).toBe('sent');
    const [, , options] = mockSubmit.mock.calls[0];
    expect(options.headers['Idempotency-Key']).toBe('perf-as-1');
  });

  it('update 200 → sent (via updatePerformance, sans submit)', async () => {
    mockUpdate.mockResolvedValue({ status: 200, data: { id: 'p-1' } });
    expect(await sendPerfItem(item('as-1', 'update'))).toBe('sent');
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('5xx → retry (transitoire)', async () => {
    mockSubmit.mockResolvedValue({ status: 503, data: {} });
    expect(await sendPerfItem(item('as-1'))).toBe('retry');
  });

  it('4xx → drop (permanent : consentement / validation)', async () => {
    mockSubmit.mockResolvedValue({ status: 403, data: { error: 'CONSENT_REQUIRED' } });
    expect(await sendPerfItem(item('as-1'))).toBe('drop');
  });
});

describe('OfflineSync (rejeu à la reconnexion)', () => {
  it('en ligne au montage : vide la file, purge le brouillon, notifie le succès', async () => {
    await enqueuePerf(deviceStore, item('as-1'));
    await saveDraft(deviceStore, 'as-1', { entries: [], rpe: 7, notes: 'x', savedAt: '' });
    mockSubmit.mockResolvedValue({ status: 201, data: { id: 'p-1' } });

    render(<OfflineSync />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith('as-1', expect.anything(), expect.anything()),
    );
    await waitFor(async () => expect(await loadOutbox(deviceStore)).toHaveLength(0));
    // Brouillon purgé une fois la perf confirmée.
    expect(await deviceStore.getItem('perf-draft:as-1')).toBeNull();
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success', title: 'Performance synchronisée' }),
    );
  });

  it('un drop (4xx) retire l’item mais conserve le brouillon et remonte une erreur', async () => {
    await enqueuePerf(deviceStore, item('as-1'));
    await saveDraft(deviceStore, 'as-1', { entries: [], rpe: 7, notes: 'x', savedAt: '' });
    mockSubmit.mockResolvedValue({ status: 422, data: { error: 'VALIDATION' } });

    render(<OfflineSync />, { wrapper: Wrapper });

    await waitFor(async () => expect(await loadOutbox(deviceStore)).toHaveLength(0));
    // Brouillon conservé pour permettre une correction.
    expect(await deviceStore.getItem('perf-draft:as-1')).not.toBeNull();
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'danger', title: 'Synchronisation impossible' }),
    );
  });

  it('hors ligne au montage : ne tente aucun envoi', async () => {
    mockOnline = false;
    await enqueuePerf(deviceStore, item('as-1'));
    render(<OfflineSync />, { wrapper: Wrapper });
    // Laisse un tick s'écouler : aucun envoi ne doit partir.
    await Promise.resolve();
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(await loadOutbox(deviceStore)).toHaveLength(1);
  });
});
