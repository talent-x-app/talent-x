import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useSession } from './SessionProvider';
import type { UserRole } from './session-store';

/**
 * Garde d'authentification/rôle pour les groupes de routes `(athlete)`/`(coach)`
 * (TLX-90). Sans ce garde, la protection reposait uniquement sur la redirection
 * de `RootIndex` (`app/index.tsx`), contournable par une course au logout (le
 * contexte n'a pas encore re-rendu avec `role=null`) ou par un deep link direct.
 *
 * Tant que la session se restaure (`isLoading`), on affiche le splash neutre —
 * pas de flash de l'écran de login. Une fois chargée, si le rôle ne correspond
 * pas (déconnecté ou mauvais espace), on redirige vers le login.
 */
export function RoleGuard({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const { role: current, isLoading } = useSession();

  if (isLoading) {
    return <View style={{ flex: 1 }} />;
  }

  if (current !== role) {
    return <Redirect href="/(auth)/login" />;
  }

  return <>{children}</>;
}
