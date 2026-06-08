import { register } from '@talent-x/api-client';
import type { Role } from '@talent-x/api-client';
import { useTheme, type Theme } from '@talent-x/design-tokens';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSession } from '../../src/auth/SessionProvider';
import { setTokens } from '../../src/auth/token-store';
import { Button, Input } from '../../src/components/ui';
import { toUserMessage, useToast } from '../../src/feedback';

/** Longueur minimale du mot de passe — alignée sur le DTO backend (`@MinLength(8)`). */
const PASSWORD_MIN_LENGTH = 8;

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'coach', label: 'Coach', hint: 'Je crée des séances et suis mes athlètes' },
  { value: 'athlete', label: 'Athlète', hint: 'Je m’entraîne et saisis mes performances' },
];

/**
 * Écran Inscription + choix du rôle (O-03 / O-04 — TLX-026).
 *
 * Crée un compte via `POST /auth/register` (client généré) : choix du rôle
 * (coach/athlète, non pré-sélectionné), e-mail et mot de passe. En cas de succès
 * (201), persiste les jetons dans le trousseau (TLX-009), ouvre la session et
 * redirige vers les tabs du rôle — même flux que la connexion. États gérés :
 * saisie invalide, chargement, e-mail déjà utilisé (409), validation serveur
 * (422), et erreurs réseau/serveur (toast). Tous les visuels dérivent des tokens.
 */
export default function RegisterScreen() {
  const theme = useTheme();
  const { colors, typography, spacing } = theme;
  const router = useRouter();
  const toast = useToast();
  const { signIn } = useSession();

  const [role, setRole] = useState<Role | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await register({
        email: email.trim(),
        password,
        role: role as Role,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      });
      if (response.status === 201) return response.data;
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
      if (status === 409) {
        setFormError('Un compte existe déjà avec cet e-mail.');
        return;
      }
      if (status === 422 || status === 400) {
        setFormError('Vérifie les informations saisies.');
        return;
      }
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const onSubmit = () => {
    setFormError(null);
    if (role == null) {
      setFormError('Choisis ton rôle pour continuer.');
      return;
    }
    if (email.trim().length === 0 || password.length === 0) {
      setFormError('Renseigne ton e-mail et ton mot de passe.');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setFormError(`Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`);
      return;
    }
    mutation.mutate();
  };

  const clearError = () => {
    if (formError) setFormError(null);
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
            Créer un compte
          </Text>
          <Text
            style={{
              marginTop: spacing[2],
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
            }}
          >
            Commence par choisir comment tu utilises Talent-X.
          </Text>
        </View>

        <View style={{ gap: spacing[4] }}>
          <View style={{ gap: spacing[3] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Je suis…
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing[3] }}>
              {ROLES.map((option) => (
                <RoleCard
                  key={option.value}
                  theme={theme}
                  label={option.label}
                  hint={option.hint}
                  selected={role === option.value}
                  disabled={mutation.isPending}
                  testID={`register-role-${option.value}`}
                  onPress={() => {
                    setRole(option.value);
                    clearError();
                  }}
                />
              ))}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Input
              label="Prénom"
              testID="register-firstName"
              containerStyle={{ flex: 1 }}
              value={firstName}
              onChangeText={(t) => {
                setFirstName(t);
                clearError();
              }}
              placeholder="Marie"
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              editable={!mutation.isPending}
            />
            <Input
              label="Nom"
              testID="register-lastName"
              containerStyle={{ flex: 1 }}
              value={lastName}
              onChangeText={(t) => {
                setLastName(t);
                clearError();
              }}
              placeholder="Coach"
              autoCapitalize="words"
              autoComplete="family-name"
              textContentType="familyName"
              editable={!mutation.isPending}
            />
          </View>

          <Input
            label="E-mail"
            testID="register-email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              clearError();
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
            testID="register-password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              clearError();
            }}
            placeholder="Au moins 8 caractères"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
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
            testID="register-submit"
            size="lg"
            fullWidth
            loading={mutation.isPending}
            onPress={onSubmit}
            style={{ marginTop: spacing[2] }}
          >
            Créer mon compte
          </Button>
          <Button
            variant="ghost"
            fullWidth
            disabled={mutation.isPending}
            onPress={() => router.replace('/(auth)/login')}
          >
            J’ai déjà un compte
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface RoleCardProps {
  theme: Theme;
  label: string;
  hint: string;
  selected: boolean;
  disabled: boolean;
  testID: string;
  onPress: () => void;
}

/** Carte de sélection de rôle (O-04). Bordure/teinte accentuées à la sélection. */
function RoleCard({ theme, label, hint, selected, disabled, testID, onPress }: RoleCardProps) {
  const { colors, typography, spacing, radius, borderWidth } = theme;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      style={{
        flex: 1,
        padding: spacing[4],
        borderRadius: radius.sm,
        borderWidth: selected ? borderWidth.focus : borderWidth.hairline,
        borderColor: selected ? colors.accent : colors.borderStrong,
        backgroundColor: selected ? colors.accentSubtle : colors.surface,
        gap: spacing[1],
        opacity: disabled ? theme.opacity.disabled : 1,
      }}
    >
      <Text
        style={{
          color: selected ? colors.accentText : colors.textPrimary,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.body.fontSize,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {hint}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center' },
});
