import { useLocalSearchParams } from 'expo-router';
import { CoachAssignScreen } from '../../../src/coach/CoachAssignScreen';

/**
 * Assignation d'une séance (C-06/C-07, TLX-063) — route empilée hors tab bar.
 *
 * `key={id}` : l'écran d'assignation est un onglet `href:null` qui **reste monté** (Tabs). Sans
 * clé, naviguer vers l'assignation d'une **autre** séance réutilise la même instance et son état
 * (`confirmed`, athlètes sélectionnés…) — d'où une **fuite** : la confirmation/sélection de la
 * séance précédente réapparaît pour la nouvelle (cf. TLX-93 côté builder). La clé force une
 * instance neuve par séance.
 */
export default function AssignSessionRoute() {
  const { id, title, from } = useLocalSearchParams<{ id: string; title?: string; from?: string }>();
  return (
    <CoachAssignScreen
      key={id}
      sessionId={id}
      sessionTitle={title || undefined}
      fromCreate={from === 'create'}
    />
  );
}
