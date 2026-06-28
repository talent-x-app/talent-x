import { listAssignments, type Assignment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button, Card, Chip } from '../components/ui';
import { SearchField } from '../components/SearchField';
import { filterByText } from '../search/text-filter';
import { disciplineVisual } from '../groups/discipline-ui';
import { sessionDiscipline } from '../progress/session-discipline';
import { AssignmentListItem, sessionTitle } from './athlete-session-ui';

type FilterKey = 'upcoming' | 'past';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'upcoming', label: 'À venir' },
  { key: 'past', label: 'Passées' },
];

const EMPTY_LABEL: Record<FilterKey, string> = {
  upcoming: 'Aucune séance à venir.',
  past: 'Aucune séance passée.',
};

/** Une séance « à venir » = à faire (assignée / en cours) ; « passée » = réalisée / sautée. */
const UPCOMING_STATUSES = new Set(['assigned', 'in_progress']);

/** Date effective d'une affectation (échéance, sinon date planifiée de la séance). */
function effectiveDate(a: Assignment): string {
  return a.dueDate ?? a.session?.scheduledDate ?? '';
}

/** Répartit les affectations en À venir (tri par échéance croissante, non datées en fin) / Passées
 *  (tri décroissant, récentes d'abord). */
function athleteBuckets(list: Assignment[]): Record<FilterKey, Assignment[]> {
  const upcoming = list
    .filter((a) => UPCOMING_STATUSES.has(a.status))
    .sort((a, b) => (effectiveDate(a) || '9999').localeCompare(effectiveDate(b) || '9999'));
  const past = list
    .filter((a) => !UPCOMING_STATUSES.has(a.status))
    .sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a)));
  return { upcoming, past };
}

/** Visuel de discipline d'une affectation (dérivé des blocs typés) — `null` si indéterminé. */
function disciplineOf(a: Assignment) {
  return disciplineVisual(sessionDiscipline(a.session?.exercises?.items));
}

/**
 * Écran Séances athlète (A-02 — TLX-065). Consomme `GET /assignments` (role-aware). Aligné sur le
 * hub coach (ADR-53) : onglets **À venir / Passées** avec **compteurs**, **filtre discipline** et
 * **recherche** par titre ; lignes cliquables vers le détail (A-03/A-04). États chargement / erreur
 * / vide, pull-to-refresh.
 */
export function AthleteSessionsScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>('upcoming');
  const [search, setSearch] = useState('');
  const [discipline, setDiscipline] = useState<string>('all');

  const query = useQuery({
    queryKey: ['assignments'],
    queryFn: async (): Promise<Assignment[]> => {
      const response = await listAssignments();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const buckets = athleteBuckets(query.data ?? []);

  // Disciplines présentes dans l'onglet courant (filtre discipline secondaire).
  const disciplineOptions = new Map<string, string>();
  for (const a of buckets[filter]) {
    const d = disciplineOf(a);
    if (d) disciplineOptions.set(d.key, d.label);
  }

  const byDiscipline =
    discipline === 'all'
      ? buckets[filter]
      : buckets[filter].filter((a) => disciplineOf(a)?.key === discipline);
  const rows = filterByText(byDiscipline, search, sessionTitle);

  const selectFilter = (key: FilterKey) => {
    setFilter(key);
    setDiscipline('all'); // les disciplines présentes changent d'un onglet à l'autre
    setSearch('');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[4] }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      {!embedded ? (
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h2.fontSize,
          }}
        >
          Séances
        </Text>
      ) : null}

      {query.isLoading ? (
        <View testID="sessions-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : query.isError ? (
        <Card testID="sessions-error">
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
            <Button testID="sessions-retry" onPress={() => void query.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : (query.data?.length ?? 0) === 0 ? (
        <Card testID="sessions-empty">
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
              textAlign: 'center',
            }}
          >
            Aucune séance affectée pour l'instant.
          </Text>
        </Card>
      ) : (
        <>
          {/* Onglets À venir / Passées + compteurs. */}
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            {FILTERS.map((f) => (
              <Chip
                key={f.key}
                testID={`sessions-filter-${f.key}`}
                selected={filter === f.key}
                onPress={() => selectFilter(f.key)}
              >
                {`${f.label} ${buckets[f.key].length}`}
              </Chip>
            ))}
          </View>

          {/* Filtre discipline (si plusieurs disciplines dans l'onglet). */}
          {disciplineOptions.size > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing[2] }}
            >
              <Chip
                testID="sessions-discipline-all"
                selected={discipline === 'all'}
                onPress={() => setDiscipline('all')}
              >
                Toutes
              </Chip>
              {[...disciplineOptions].map(([key, label]) => (
                <Chip
                  key={key}
                  testID={`sessions-discipline-${key}`}
                  selected={discipline === key}
                  onPress={() => setDiscipline(key)}
                >
                  {label}
                </Chip>
              ))}
            </ScrollView>
          ) : null}

          {/* Recherche par titre (TLX-117) — filtre client. */}
          <SearchField
            testID="sessions-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher une séance"
          />

          {rows.length === 0 ? (
            <Card testID={search.trim() ? 'sessions-no-match' : 'sessions-empty-filter'}>
              <Text
                style={{
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                  textAlign: 'center',
                }}
              >
                {search.trim()
                  ? `Aucune séance ne correspond à « ${search.trim()} ».`
                  : EMPTY_LABEL[filter]}
              </Text>
            </Card>
          ) : (
            <View style={{ gap: spacing[3] }}>
              {rows.map((assignment) => (
                <AssignmentListItem
                  key={assignment.id}
                  assignment={assignment}
                  onPress={() =>
                    router.push({
                      pathname: '/(athlete)/session/[id]' as const,
                      params: { id: assignment.id },
                    })
                  }
                />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
