import { updateConsent } from '@talent-x/api-client';
import { ConsentType } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { UserRole } from '../../src/auth/session-store';
import { useSession } from '../../src/auth/SessionProvider';
import { Button, Card } from '../../src/components/ui';
import { toUserMessage, useToast } from '../../src/feedback';

interface ConsentItem {
  type: ConsentType;
  title: string;
  description: string;
}

/**
 * Catalogue des consentements présentés à l'onboarding (TX-SEC-003 §6, RB-08).
 * `data_processing` et `coach_access` portent sur les données de performance —
 * propres à l'athlète ; `marketing` (communications non essentielles) concerne
 * tous les rôles. Aucune case n'est pré-cochée : l'octroi est un opt-in explicite.
 */
const CONSENT_ITEMS_BY_ROLE: Record<UserRole, ConsentItem[]> = {
  athlete: [
    {
      type: ConsentType.data_processing,
      title: 'Traitement de mes performances',
      description:
        'Autoriser Talent-X à enregistrer et traiter mes données d’entraînement pour suivre ma progression.',
    },
    {
      type: ConsentType.coach_access,
      title: 'Accès de mon coach',
      description:
        'Autoriser mon coach à consulter mes performances et statistiques. Révocable à tout moment.',
    },
    {
      type: ConsentType.marketing,
      title: 'Communications non essentielles',
      description: 'Recevoir des nouveautés et conseils. Sans incidence sur le service.',
    },
  ],
  coach: [
    {
      type: ConsentType.marketing,
      title: 'Communications non essentielles',
      description: 'Recevoir des nouveautés et conseils. Sans incidence sur le service.',
    },
  ],
};

function isUserRole(value: unknown): value is UserRole {
  return value === 'coach' || value === 'athlete';
}

/**
 * Écran Consentement (O-05 — TLX-030). Dernière étape de l'onboarding, juste
 * après l'inscription (les jetons sont déjà persistés mais la session n'est pas
 * encore ouverte). Présente les consentements RGPD séparés, **sans case
 * pré-cochée** (opt-in). « Continuer » enregistre chaque choix via
 * `PUT /users/me/consents` (la version de texte est appliquée côté serveur via
 * `CONSENT_TEXT_VERSION`), ouvre la session puis redirige vers les tabs du rôle.
 * États gérés : enregistrement (chargement), erreur réseau/serveur (toast).
 */
export default function ConsentScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { signIn } = useSession();

  const params = useLocalSearchParams<{ role?: string }>();
  const role: UserRole = isUserRole(params.role) ? params.role : 'athlete';
  const items = CONSENT_ITEMS_BY_ROLE[role];

  const [granted, setGranted] = useState<Record<string, boolean>>({});

  const mutation = useMutation({
    mutationFn: async () => {
      const responses = await Promise.all(
        items.map((item) =>
          updateConsent({ type: item.type, granted: granted[item.type] ?? false }),
        ),
      );
      const failed = responses.find((r) => r.status !== 200);
      // Le mutator ne lève pas : on propage l'enveloppe { status, data } d'erreur.
      if (failed) throw failed;
    },
    onSuccess: async () => {
      await signIn(role);
      router.replace('/');
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { padding: spacing[6] }]}
    >
      <View style={{ marginBottom: spacing[6] }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h1.fontSize,
            letterSpacing: -0.5,
          }}
        >
          Tes consentements
        </Text>
        <Text
          style={{
            marginTop: spacing[2],
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.body.fontSize,
          }}
        >
          Tu décides de ce que Talent-X peut traiter. Tu pourras modifier ces choix à tout moment
          dans ton profil.
        </Text>
      </View>

      <View style={{ gap: spacing[3] }}>
        {items.map((item) => {
          const value = granted[item.type] ?? false;
          return (
            <Card key={item.type}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: spacing[1], paddingRight: spacing[3] }}>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontFamily: typography.fontFamily.semibold,
                      fontSize: typography.body.fontSize,
                    }}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: typography.fontFamily.regular,
                      fontSize: typography.bodySm.fontSize,
                    }}
                  >
                    {item.description}
                  </Text>
                </View>
                <Switch
                  testID={`consent-switch-${item.type}`}
                  value={value}
                  disabled={mutation.isPending}
                  onValueChange={(next) => setGranted((prev) => ({ ...prev, [item.type]: next }))}
                  trackColor={{ false: colors.surfaceSunken, true: colors.accent }}
                  thumbColor={colors.textOnAccent}
                  ios_backgroundColor={colors.surfaceSunken}
                  accessibilityLabel={item.title}
                />
              </View>
            </Card>
          );
        })}
      </View>

      <Button
        testID="consent-submit"
        size="lg"
        fullWidth
        loading={mutation.isPending}
        onPress={() => mutation.mutate()}
        style={{ marginTop: spacing[6] }}
      >
        Continuer
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
