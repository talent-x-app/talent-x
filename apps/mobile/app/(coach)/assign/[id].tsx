import { useLocalSearchParams } from 'expo-router';
import { CoachAssignScreen } from '../../../src/coach/CoachAssignScreen';

/** Assignation d'une séance (C-06/C-07, TLX-063) — route empilée hors tab bar. */
export default function AssignSessionRoute() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  return <CoachAssignScreen sessionId={id} sessionTitle={title || undefined} />;
}
