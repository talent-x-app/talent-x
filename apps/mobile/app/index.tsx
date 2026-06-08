import { useSession } from '../src/auth/SessionProvider';
import { Redirect } from 'expo-router';
import { View } from 'react-native';

// Point d'entrée : redirige vers les tabs du rôle ou vers la connexion.
export default function RootIndex() {
  const { role, isLoading } = useSession();

  if (isLoading) {
    // Splash toujours visible pendant le chargement — pas d'écran intermédiaire.
    return <View style={{ flex: 1 }} />;
  }

  if (role === 'coach') return <Redirect href="/(coach)" />;
  if (role === 'athlete') return <Redirect href="/(athlete)" />;
  return <Redirect href="/(auth)/login" />;
}
