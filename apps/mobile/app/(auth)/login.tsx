import { login } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../src/auth/SessionProvider';
import { setTokens } from '../../src/auth/token-store';
import { Button, Input } from '../../src/components/ui';
import { toUserMessage, useToast } from '../../src/feedback';

/**
 * Écran Connexion (O-02 — TLX-025).
 *
 * Authentifie via `POST /auth/login` (client généré), persiste les jetons dans le
 * trousseau (TLX-009), enregistre le rôle de session puis redirige vers les tabs
 * du rôle. États gérés : saisie invalide, chargement, identifiants erronés (401),
 * et erreurs réseau/serveur (toast). Tous les visuels dérivent des tokens.
 */
export default function LoginScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { signIn } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await login({ email: email.trim(), password });
      if (response.status === 200) return response.data;
      // Le mutator ne lève pas : on propage l'enveloppe { status, data } d'erreur.
      throw response;
    },
    onSuccess: async (session) => {
      await setTokens({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      });
      await signIn(session.user.role);
      router.replace('/');
    },
    onError: (error: unknown) => {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? (error as { status: number }).status
          : undefined;
      if (status === 401) {
        setFormError('E-mail ou mot de passe incorrect.');
        return;
      }
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const onSubmit = () => {
    setFormError(null);
    if (email.trim().length === 0 || password.length === 0) {
      setFormError('Renseigne ton e-mail et ton mot de passe.');
      return;
    }
    mutation.mutate();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { padding: spacing[6] }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.brand, { marginBottom: spacing[8] }]}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.h1.fontSize,
              letterSpacing: -0.5,
            }}
          >
            Talent-X
          </Text>
          <Text
            style={{
              marginTop: spacing[2],
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
            }}
          >
            Coach et athlète, connectés.
          </Text>
        </View>

        <View style={{ gap: spacing[4] }}>
          <Input
            label="E-mail"
            testID="login-email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (formError) setFormError(null);
            }}
            placeholder="ton@email.fr"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            editable={!mutation.isPending}
          />
          <Input
            label="Mot de passe"
            testID="login-password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (formError) setFormError(null);
            }}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            editable={!mutation.isPending}
          />

          {formError != null && (
            <Text
              accessibilityRole="alert"
              style={{
                color: colors.danger,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {formError}
            </Text>
          )}

          <Button
            testID="login-submit"
            size="lg"
            fullWidth
            loading={mutation.isPending}
            onPress={onSubmit}
            style={{ marginTop: spacing[2] }}
          >
            Se connecter
          </Button>
          <Button
            variant="ghost"
            fullWidth
            disabled={mutation.isPending}
            onPress={() => router.push('/(auth)/register')}
          >
            Créer un compte
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center' },
});
