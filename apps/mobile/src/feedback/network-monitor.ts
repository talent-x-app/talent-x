/**
 * Détection de connectivité (TLX-010), au-dessus de `@react-native-community/netinfo`
 * (paquet recommandé par Expo). Isolé derrière cette abstraction pour rester
 * testable (mock simple) et découpler le reste de l'app du module natif.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/**
 * Déduit l'état « en ligne » d'un état NetInfo.
 * `isInternetReachable` peut être `null` (inconnu, typiquement au démarrage) :
 * on ne déclare hors-ligne que sur un signal *explicitement* négatif, afin
 * d'éviter un faux bandeau au lancement.
 */
export function isOnline(state: NetInfoState): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

/**
 * S'abonne aux changements de connectivité. Renvoie une fonction de
 * désabonnement. Le listener est invoqué à chaque changement d'état réseau.
 */
export function subscribeNetwork(listener: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((state) => listener(isOnline(state)));
}
