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
import { useEffect } from 'react';
import { SessionProvider } from '../src/auth/SessionProvider';
import { QueryProvider } from '../src/data/QueryProvider';
import { ErrorBoundary, OfflineBanner, ToastProvider } from '../src/feedback';

// Garde le splash visible tant que les polices ne sont pas chargées.
void SplashScreen.preventAutoHideAsync();

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
        <ErrorBoundary>
          <ToastProvider>
            <SessionProvider>
              <Stack screenOptions={{ headerShown: false }} />
              <OfflineBanner />
            </SessionProvider>
          </ToastProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </QueryProvider>
  );
}
