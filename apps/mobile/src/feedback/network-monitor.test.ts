import type { NetInfoState } from '@react-native-community/netinfo';
import NetInfo from '@react-native-community/netinfo';
import { isOnline, subscribeNetwork } from './network-monitor';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));

const state = (partial: Partial<NetInfoState>): NetInfoState => partial as NetInfoState;

describe('network-monitor (TLX-010)', () => {
  describe('isOnline', () => {
    it('est en ligne quand connecté et internet joignable', () => {
      expect(isOnline(state({ isConnected: true, isInternetReachable: true }))).toBe(true);
    });

    it('reste optimiste quand la joignabilité est inconnue (null au démarrage)', () => {
      expect(isOnline(state({ isConnected: true, isInternetReachable: null }))).toBe(true);
    });

    it('est hors ligne quand non connecté', () => {
      expect(isOnline(state({ isConnected: false, isInternetReachable: false }))).toBe(false);
    });

    it('est hors ligne quand internet est explicitement injoignable', () => {
      expect(isOnline(state({ isConnected: true, isInternetReachable: false }))).toBe(false);
    });
  });

  describe('subscribeNetwork', () => {
    it('s’abonne à NetInfo et propage l’état en ligne au listener', () => {
      const listener = jest.fn();
      const unsub = subscribeNetwork(listener);

      // Récupère le callback passé à NetInfo et simule un évènement hors-ligne.
      const netInfoCb = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0];
      netInfoCb(state({ isConnected: false }));

      expect(listener).toHaveBeenCalledWith(false);
      expect(typeof unsub).toBe('function');
    });
  });
});
