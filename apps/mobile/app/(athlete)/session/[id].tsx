import { useLocalSearchParams } from 'expo-router';
import { SessionDetailScreen } from '../../../src/athlete/SessionDetailScreen';

/**
 * Détail d'une séance affectée + saisie de perf (A-03/A-04, TLX-065/071) — route empilée.
 *
 * `key={id}` (ADR-58) : écran d'onglet masqué (`href: null`), que React Navigation ne démonte
 * jamais. Sans clé, une seule instance sert toutes les séances et l'état local de l'une fuit
 * vers la suivante (TLX-236, TLX-239). Le brouillon hors ligne (TLX-077) survit au remontage :
 * il est persisté sur l'appareil et rechargé par un effet indexé sur `[id]`.
 */
export default function SessionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionDetailScreen key={id} />;
}
