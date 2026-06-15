import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Card } from '../components/ui';
import { ResponsiveContent } from '../responsive/ResponsiveContent';
import { DISCIPLINES } from './discipline-assistants';
import { customSessionHref, disciplineAssistantHref } from './navigation';

/**
 * Écran d'entrée « Nouvelle séance » (C-05 / ADR-38, TLX-154). Point de départ de la création
 * côté coach : 5 cartes de discipline ouvrant l'assistant guidé correspondant (TLX-155→159),
 * plus une option « Personnalisé » qui ouvre le constructeur générique inchangé (canvas de
 * blocs libre, séances multi-disciplines). La discipline n'est pas persistée — l'assistant ne
 * fait que pré-structurer la séance (cf. ADR-38 §1).
 */
export function NewSessionScreen() {
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
            Nouvelle séance
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
            }}
          >
            Choisis une discipline pour un assistant guidé, ou pars d’une séance personnalisée.
          </Text>
        </View>

        {/* Cartes de discipline → assistant dédié (TLX-155→159). */}
        <View style={{ gap: spacing[3] }}>
          {DISCIPLINES.map((d) => (
            <Card
              key={d.key}
              testID={`new-session-discipline-${d.key}`}
              accessibilityLabel={d.label}
              onPress={() => router.push(disciplineAssistantHref(d.key))}
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

        {/* Option « Personnalisé » → constructeur générique (C-05) inchangé. */}
        <Card
          testID="new-session-custom"
          accessibilityLabel="Personnalisé"
          onPress={() => router.push(customSessionHref())}
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
                Personnalisé
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Constructeur libre — blocs, groupes, séances multi-disciplines
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textMuted} />
          </View>
        </Card>
      </ResponsiveContent>
    </ScrollView>
  );
}
