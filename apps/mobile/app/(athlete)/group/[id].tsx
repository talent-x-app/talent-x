import { useLocalSearchParams } from 'expo-router';
import { AthleteGroupHubScreen } from '../../../src/groups/AthleteGroupHubScreen';

/**
 * Hub de groupe (athlète) — route empilée hors tab bar (ADR-43, TLX-173). Onglets Séances /
 * Calendrier / Coéquipiers / Infos.
 *
 * `key={id}` (ADR-58) : écran d'onglet masqué, jamais démonté. Sans clé, l'onglet ouvert sur
 * un groupe s'appliquait au groupe suivant.
 */
export default function AthleteGroupHubRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AthleteGroupHubScreen key={id} groupId={id} />;
}
