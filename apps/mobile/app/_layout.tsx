import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { ThemeProvider } from '@talent-x/design-tokens';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { enableScreens } from 'react-native-screens';
import { useEffect } from 'react';
import { SessionProvider } from '../src/auth/SessionProvider';
import { QueryProvider } from '../src/data/QueryProvider';
import { ErrorBoundary, OfflineBanner, ToastProvider } from '../src/feedback';
import { PushRegistration } from '../src/notifications/PushRegistration';
import { OfflineSync } from '../src/offline';
import { WebFocusStyle } from '../src/web/web-focus-style';

// Garde le splash visible tant que les polices ne sont pas chargées.
void SplashScreen.preventAutoHideAsync();

// TLX-222 : sans cet appel, react-native-screens désactive son mécanisme de gel
// (`display: none` sur les écrans d'onglet inactifs) sur **web** — les onglets masqués
// (formulaires/détails routés en `Tabs.Screen` hors barre) retombent sur un simple
// `pointerEvents` que les boutons enfants (Pressable) réactivent explicitement,
// laissant un calque fantôme intercepter les clics après un `router.replace`.
enableScreens();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // ThemeProvider sans prop = suit le schéma de couleurs de l'OS (dark-first).
  // QueryProvider initialise la couche données (cache serveur + auth/refresh).
  // ErrorBoundary + ToastProvider + OfflineBanner : feedback global (TLX-010).
  return (
    <QueryProvider>
      <ThemeProvider>
        {/* Focus web propre (outline accent au clavier, rien au clic souris). No-op natif. */}
        <WebFocusStyle />
        <ErrorBoundary>
          <ToastProvider>
            <SessionProvider>
              <Stack screenOptions={{ headerShown: false }} />
              <OfflineBanner />
              {/* Rejoue la file d'écriture des perfs à la reconnexion (TLX-077). */}
              <OfflineSync />
              {/* Enregistre le jeton push une fois connecté + route les taps (TLX-226). */}
              <PushRegistration />
            </SessionProvider>
          </ToastProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </QueryProvider>
  );
}
