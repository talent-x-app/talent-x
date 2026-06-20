import { useLocalSearchParams } from 'expo-router';
import { AthleteGroupHubScreen } from '../../../src/groups/AthleteGroupHubScreen';

/**
 * Hub de groupe (athlète) — route empilée hors tab bar (ADR-43, TLX-173). Onglets Séances /
 * Calendrier / Coéquipiers / Infos.
 */
export default function AthleteGroupHubRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AthleteGroupHubScreen groupId={id} />;
}
