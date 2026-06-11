import { useLocalSearchParams } from 'expo-router';
import { SessionBuilderScreen } from '../../../../src/coach/SessionBuilderScreen';

/** Édition d'une séance (constructeur C-05, TLX-052) — depuis le détail lecture seule. */
export default function EditSessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionBuilderScreen sessionId={id} />;
}
