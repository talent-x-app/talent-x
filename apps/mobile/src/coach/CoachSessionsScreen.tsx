import { listAssignments, listSessions, type Assignment, type Session } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Button, Card, Chip } from '../components/ui';
import { ResponsiveContent } from '../responsive/ResponsiveContent';
import { formatSessionDate } from '../athlete/athlete-session-ui';
import {
  coachSessionBuckets,
  type CalendarEntry,
  type CoachSessionBuckets,
} from '../calendar/calendar-model';
import { coachSessionDetailHref, editSessionHref, newTemplateHref } from './navigation';

type FilterKey = keyof CoachSessionBuckets;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'upcoming', label: 'À venir' },
  { key: 'past', label: 'Passées' },
  { key: 'drafts', label: 'Brouillons' },
  { key: 'templates', label: 'Modèles' },
];

const EMPTY_LABEL: Record<FilterKey, string> = {
  upcoming: 'Aucune séance à venir.',
  past: 'Aucune séance passée.',
  drafts: 'Aucun brouillon.',
  templates: 'Aucun modèle.',
};

/**
 * Liste des séances du coach (ADR-53, lot 1) — filtres À venir / Passées / Brouillons / Modèles,
 * dérivés de `GET /sessions` + `GET /assignments` (date effective, TLX-195). Rendue dans le hub
 * « Séances » (mode embarqué). Lignes simples (titre · date effective ou « Non planifiée » ·
 * statut) ; tap → détail (ou édition pour un modèle). Enrichissement (discipline/assignés/retard,
 * recherche, compteurs) = lot 2.
 */
export function CoachSessionsScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>('upcoming');

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: async (): Promise<Session[]> => {
      const response = await listSessions();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });
  // Échéances pour la date effective des séances non datées mais assignées (occurrences, TLX-195).
  const assignments = useQuery({
    queryKey: ['assignments'],
    queryFn: async (): Promise<Assignment[]> => {
      const response = await listAssignments({ limit: 100 });
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const buckets = coachSessionBuckets(sessions.data ?? [], assignments.data ?? [], new Date());
  const rows = buckets[filter];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6] }}
    >
      <ResponsiveContent testID="coach-responsive-content" style={{ gap: spacing[4] }}>
        {/* Filtres. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              testID={`coach-sessions-filter-${f.key}`}
              selected={filter === f.key}
              onPress={() => setFilter(f.key)}
            >
              {f.label}
            </Chip>
          ))}
        </View>

        {/* Création d'un modèle depuis le hub (la bibliothèque est rapatriée ici, ADR-53 §D4). */}
        {filter === 'templates' ? (
          <Button
            testID="coach-sessions-new-template"
            variant="secondary"
            leftIcon={<Feather name="plus" size={18} color={colors.textPrimary} />}
            onPress={() => router.push(newTemplateHref())}
          >
            Nouveau modèle
          </Button>
        ) : null}

        {sessions.isLoading ? (
          <View testID="coach-sessions-loading" style={{ paddingVertical: spacing[6] }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : sessions.isError ? (
          <Card testID="coach-sessions-error">
            <View style={{ gap: spacing[4] }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                  textAlign: 'center',
                }}
              >
                Impossible de charger tes séances.
              </Text>
              <Button testID="coach-sessions-retry" onPress={() => void sessions.refetch()}>
                Réessayer
              </Button>
            </View>
          </Card>
        ) : rows.length === 0 ? (
          <Card testID="coach-sessions-empty">
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              {EMPTY_LABEL[filter]}
            </Text>
          </Card>
        ) : (
          <View style={{ gap: spacing[3] }}>
            {rows.map((entry) => (
              <SessionRow
                key={entry.id}
                entry={entry}
                filter={filter}
                onPress={() =>
                  router.push(
                    filter === 'templates'
                      ? editSessionHref(entry.id)
                      : coachSessionDetailHref(entry.id),
                  )
                }
              />
            ))}
          </View>
        )}
      </ResponsiveContent>
    </ScrollView>
  );
}

/** Ligne de séance (lot 1) : titre + sous-ligne (date effective / « Non planifiée » / statut). */
function SessionRow({
  entry,
  filter,
  onPress,
}: {
  entry: CalendarEntry;
  filter: FilterKey;
  onPress: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const dateLabel =
    entry.date != null
      ? formatSessionDate(entry.date)
      : filter === 'upcoming'
        ? 'Non planifiée'
        : null;
  const subtitle = [dateLabel, entry.statusLabel].filter(Boolean).join(' · ');
  return (
    <Card testID={`coach-session-row-${entry.id}`} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            {entry.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {subtitle}
            </Text>
            {entry.overdue ? (
              <Text
                testID={`coach-session-row-${entry.id}-overdue`}
                style={{
                  color: colors.danger,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                · En retard
              </Text>
            ) : null}
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}
