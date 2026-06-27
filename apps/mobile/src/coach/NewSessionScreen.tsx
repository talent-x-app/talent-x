import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Card } from '../components/ui';
import { ResponsiveContent } from '../responsive/ResponsiveContent';
import { DISCIPLINES } from './discipline-assistants';
import { customSessionHref, disciplineAssistantHref } from './navigation';

/**
 * Écran d'entrée de création (C-05 / ADR-38, TLX-154). Point de départ côté coach : 6 cartes de
 * discipline ouvrant l'assistant guidé correspondant (TLX-155→159, ADR-41), plus une option
 * « Composer une séance » qui ouvre le canvas composite multi-disciplines (ADR-42/52). La
 * discipline n'est pas persistée — l'assistant ne fait que pré-structurer la séance (ADR-38 §1).
 *
 * `asTemplate` (ADR-54) : **entrée unifiée** séance/modèle. En mode modèle, le même sélecteur amorce
 * un **modèle** (`status=template`) — chaque carte propage le statut jusqu'au constructeur, qui
 * masque date/assignation et sauve en `template` (ADR-29). Aucun écran dupliqué.
 */
export function NewSessionScreen({ asTemplate = false }: { asTemplate?: boolean }) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6] }}
    >
      <ResponsiveContent testID="coach-responsive-content" style={{ gap: spacing[5] }}>
        <Pressable
          testID="new-session-back"
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
        >
          <Feather name="chevron-left" size={22} color={colors.textSecondary} />
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Accueil
          </Text>
        </Pressable>

        <View style={{ gap: spacing[2] }}>
          <Text
            testID="new-session-title"
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.h1.fontSize,
              letterSpacing: -0.5,
            }}
          >
            {asTemplate ? 'Nouveau modèle' : 'Nouvelle séance'}
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
            }}
          >
            {asTemplate
              ? 'Choisis une discipline pour un assistant guidé, ou compose un modèle multi-disciplines.'
              : 'Choisis une discipline pour un assistant guidé, ou compose une séance multi-disciplines.'}
          </Text>
        </View>

        {/* Cartes de discipline → assistant dédié (TLX-155→159). */}
        <View style={{ gap: spacing[3] }}>
          {DISCIPLINES.map((d) => (
            <Card
              key={d.key}
              testID={`new-session-discipline-${d.key}`}
              accessibilityLabel={d.label}
              onPress={() => router.push(disciplineAssistantHref(d.key, asTemplate))}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.accentSubtle,
                  }}
                >
                  <Feather name={d.icon} size={20} color={colors.accentText} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontFamily: typography.fontFamily.medium,
                      fontSize: typography.body.fontSize,
                    }}
                  >
                    {d.label}
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: typography.fontFamily.regular,
                      fontSize: typography.bodySm.fontSize,
                    }}
                  >
                    {d.tagline}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textMuted} />
              </View>
            </Card>
          ))}
        </View>

        {/* Option « Composer » → canvas composite multi-disciplines (ADR-42/52). */}
        <Card
          testID="new-session-custom"
          accessibilityLabel={asTemplate ? 'Composer un modèle' : 'Composer une séance'}
          onPress={() => router.push(customSessionHref(asTemplate))}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceSunken,
              }}
            >
              <Feather name="sliders" size={20} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  color: colors.textPrimary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.body.fontSize,
                }}
              >
                {asTemplate ? 'Composer un modèle' : 'Composer une séance'}
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {asTemplate
                  ? 'Assemblez un modèle série par série, toutes disciplines'
                  : 'Assemblez une séance série par série, toutes disciplines'}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textMuted} />
          </View>
        </Card>
      </ResponsiveContent>
    </ScrollView>
  );
}
