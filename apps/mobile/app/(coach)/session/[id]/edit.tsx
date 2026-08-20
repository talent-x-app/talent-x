import { useLocalSearchParams } from 'expo-router';
import { SessionBuilderScreen } from '../../../../src/coach/SessionBuilderScreen';

/**
 * Édition d'une séance (constructeur C-05, TLX-052) — depuis le détail lecture seule.
 *
 * `key={id}` (ADR-58) : écran d'onglet masqué, jamais démonté. Le formulaire est réhydraté par
 * un effet sur les données chargées, mais `error` ne l'était pas, et la séance suivante
 * s'ouvrait sur les champs de la précédente en attendant sa réponse. La remise à zéro par
 * `useFocusEffect` du mode **création** (TLX-93) reste en place : elle traite `session/new`,
 * une route sans paramètre, que cette clé ne couvre pas.
 */
export default function EditSessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionBuilderScreen key={id} sessionId={id} />;
}
