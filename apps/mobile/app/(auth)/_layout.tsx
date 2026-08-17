import { Stack } from 'expo-router';
import { useScreenSceneStyle } from '../../src/responsive/screen-inset';

export default function AuthLayout() {
  // Même raison que les tabs : `headerShown: false` laisserait le contenu sous la barre d'état.
  const contentStyle = useScreenSceneStyle();

  return <Stack screenOptions={{ headerShown: false, contentStyle }} />;
}
