import { useLocalSearchParams } from 'expo-router';
import { SessionBuilderScreen } from '../../../src/coach/SessionBuilderScreen';

/** Édition d'une séance (C-05, TLX-052) — route empilée hors tab bar. */
export default function EditSessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionBuilderScreen sessionId={id} />;
}
