import { listAssignments, listSessions, type Assignment, type Session } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Button, Card, Chip } from '../components/ui';
import { ResponsiveContent } from '../responsive/ResponsiveContent';
import { SearchField } from '../components/SearchField';
import { filterByText } from '../search/text-filter';
import { formatSessionDate } from '../athlete/athlete-session-ui';
import {
  assignedCountBySession,
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
 * Liste des séances du coach (ADR-53) — filtres À venir / Passées / Brouillons / Modèles dérivés de
 * `GET /sessions` + `GET /assignments` (dates effectives TLX-195). Rendue dans le hub « Séances ».
 * Lot 2 : **compteurs** par onglet, **lignes enrichies** (pastille discipline · « assigné à N » ·
 * badge En retard), **recherche** par titre + **filtre discipline**.
 */
export function CoachSessionsScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>('upcoming');
  const [search, setSearch] = useState('');
  const [discipline, setDiscipline] = useState<string>('all');

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: async (): Promise<Session[]> => {
      const response = await listSessions();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });
  // Échéances (date effective) + nombre d'athlètes affectés par séance (« assigné à N »).
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
  const assignedCounts = assignedCountBySession(assignments.data ?? []);

  // Disciplines présentes dans l'onglet courant (pour le filtre discipline secondaire).
  const disciplineOptions = new Map<string, string>();
  for (const e of buckets[filter]) {
    if (e.discipline) disciplineOptions.set(e.discipline.key, e.discipline.label);
  }

  const byDiscipline =
    discipline === 'all'
      ? buckets[filter]
      : buckets[filter].filter((e) => e.discipline?.key === discipline);
  const rows = filterByText(byDiscipline, search, (e) => e.title);

  const selectFilter = (key: FilterKey) => {
    setFilter(key);
    setDiscipline('all'); // les disciplines présentes changent d'un onglet à l'autre
    setSearch('');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6] }}
    >
      <ResponsiveContent testID="coach-responsive-content" style={{ gap: spacing[4] }}>
        {/* Filtres de statut + compteurs. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              testID={`coach-sessions-filter-${f.key}`}
              selected={filter === f.key}
              onPress={() => selectFilter(f.key)}
            >
              {`${f.label} ${buckets[f.key].length}`}
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
        ) : buckets[filter].length === 0 ? (
          <Card testID="coach-sessions-empty">
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              {EMPTY_LABEL[filter]}
            </Text>
          </Card>
        ) : (
          <>
            {/* Recherche par titre. */}
            <SearchField
              testID="coach-sessions-search"
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher une séance"
            />

            {/* Filtre discipline (si au moins 2 disciplines présentes dans l'onglet). */}
            {disciplineOptions.size > 1 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
                <Chip
                  testID="coach-sessions-discipline-all"
                  selected={discipline === 'all'}
                  onPress={() => setDiscipline('all')}
                >
                  Toutes
                </Chip>
                {[...disciplineOptions].map(([key, label]) => (
                  <Chip
                    key={key}
                    testID={`coach-sessions-discipline-${key}`}
                    selected={discipline === key}
                    onPress={() => setDiscipline(key)}
                  >
                    {label}
                  </Chip>
                ))}
              </View>
            ) : null}

            {rows.length === 0 ? (
              <Card testID="coach-sessions-no-match">
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.body.fontSize,
                    textAlign: 'center',
                  }}
                >
                  Aucune séance ne correspond.
                </Text>
              </Card>
            ) : (
              <View style={{ gap: spacing[3] }}>
                {rows.map((entry) => (
                  <SessionRow
                    key={entry.id}
                    entry={entry}
                    filter={filter}
                    assignedCount={assignedCounts.get(entry.id) ?? 0}
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
          </>
        )}
      </ResponsiveContent>
    </ScrollView>
  );
}

/**
 * Ligne de séance enrichie (lot 2) : pastille discipline + titre, sous-ligne (date effective /
 * « Non planifiée » · statut · « assigné à N ») + badge « En retard ».
 */
function SessionRow({
  entry,
  filter,
  assignedCount,
  onPress,
}: {
  entry: CalendarEntry;
  filter: FilterKey;
  assignedCount: number;
  onPress: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const dotColor = entry.discipline ? (colors[entry.discipline.colorKey] as string) : colors.border;
  const dateLabel =
    entry.date != null
      ? formatSessionDate(entry.date)
      : filter === 'upcoming'
        ? 'Non planifiée'
        : null;
  const assignedLabel =
    assignedCount > 0 ? `${assignedCount} athlète${assignedCount > 1 ? 's' : ''}` : null;
  const subtitle = [dateLabel, entry.statusLabel, assignedLabel].filter(Boolean).join(' · ');
  return (
    <Card testID={`coach-session-row-${entry.id}`} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor }} />
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
                color: colors.textSecondary,
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
