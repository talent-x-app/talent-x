import { forgotPassword } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Input } from '../../src/components/ui';
import { toUserMessage, useToast } from '../../src/feedback';

/**
 * Écran « Mot de passe oublié » (TLX-234) — moitié cliente de TLX-104.
 *
 * Demande l'envoi du lien de réinitialisation via `POST /auth/forgot-password`. Le lien
 * reçu par email n'ouvre PAS cette application : il pointe le site public, seul capable
 * de servir quelqu'un qui a changé de téléphone ou ouvre son mail depuis un ordinateur
 * (ADR-57). Cet écran s'arrête donc à la demande.
 *
 * **Message neutre, y compris en succès.** Le serveur répond 202 qu'un compte existe ou
 * non (anti-énumération) ; un écran qui dirait « email envoyé » pour une adresse connue
 * et autre chose sinon annulerait cette propriété côté client. On affiche donc toujours
 * la même phrase conditionnelle.
 */
export default function ForgotPasswordScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await forgotPassword({ email: email.trim() });
      if (response.status === 202) return;
      // Le mutator ne lève pas : on propage l'enveloppe { status, data } d'erreur.
      throw response;
    },
    onSuccess: () => setRequested(true),
    onError: (error: unknown) => {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? (error as { status: number }).status
          : undefined;
      if (status === 422 || status === 400) {
        setFormError('Vérifie l’adresse e-mail saisie.');
        return;
      }
      if (status === 429) {
        setFormError('Trop de demandes. Réessaie dans quelques minutes.');
        return;
      }
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const onSubmit = () => {
    setFormError(null);
    if (email.trim().length === 0) {
      setFormError('Renseigne ton e-mail.');
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
        <View style={{ marginBottom: spacing[8] }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.h1.fontSize,
              letterSpacing: -0.5,
            }}
          >
            Mot de passe oublié
          </Text>
          <Text
            style={{
              marginTop: spacing[2],
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
            }}
          >
            Indique ton e-mail : nous t’envoyons un lien pour choisir un nouveau mot de passe.
          </Text>
        </View>

        <View style={{ gap: spacing[4] }}>
          {requested ? (
            <Text
              testID="forgot-password-sent"
              accessibilityRole="alert"
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
              }}
            >
              Si un compte existe pour cette adresse, un email vient d’être envoyé. Ouvre le lien
              qu’il contient pour choisir un nouveau mot de passe — il expire au bout d’une heure.
            </Text>
          ) : (
            <>
              <Input
                label="E-mail"
                testID="forgot-password-email"
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
                testID="forgot-password-submit"
                size="lg"
                fullWidth
                loading={mutation.isPending}
                onPress={onSubmit}
                style={{ marginTop: spacing[2] }}
              >
                Envoyer le lien
              </Button>
            </>
          )}

          <Button
            testID="forgot-password-back"
            variant="ghost"
            fullWidth
            disabled={mutation.isPending}
            onPress={() => router.replace('/(auth)/login')}
          >
            Revenir à la connexion
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center' },
});
