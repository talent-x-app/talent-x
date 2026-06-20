import { type Assignment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { SectionTitle } from '../sessions/session-content-ui';
import { partitionFeed } from './group-feed';
import { GroupSessionRow, NextUpCard } from './group-session-ui';
import { FeedSkeleton, FeedError } from './group-states-ui';

/** Nombre de séances passées affichées avant le bouton « Voir tout l'historique ». */
const RECENT_PAST_LIMIT = 3;

/**
 * Onglet **Séances** du hub de groupe (ADR-43 §4, maquette `group-feed-v1`) : carte « next-up »
 * mise en avant, fil groupé À venir / Passées récentes, bouton « Voir tout l'historique (N) ».
 * Lecture seule (Phase A). Le fil couvre **toutes** les séances de l'athlète (pas de provenance de
 * groupe avant le Lot 2, ADR-30) — libellé honnête.
 */
export function GroupSessionsTab({
  assignments,
  isLoading,
  isError,
  onRetry,
  onOpen,
  now,
}: {
  assignments?: Assignment[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpen: (assignment: Assignment) => void;
  now: Date;
}) {
  const { colors, typography, spacing } = useTheme();
  const [showAllPast, setShowAllPast] = useState(false);

  if (isLoading) return <FeedSkeleton testID="group-sessions-loading" />;
  if (isError) {
    return (
      <FeedError
        testID="group-sessions-error"
        message="Impossible de charger les séances."
        onRetry={onRetry}
      />
    );
  }

  const { upcoming, past, nextUp } = partitionFeed(assignments ?? [], now);

  if (upcoming.length === 0 && past.length === 0) {
    return (
      <Card testID="group-sessions-empty">
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.body.fontSize,
            textAlign: 'center',
          }}
        >
          Aucune séance pour l'instant. Tu seras notifié·e dès qu'une séance arrive.
        </Text>
      </Card>
    );
  }

  const laterUpcoming = nextUp ? upcoming.slice(1) : upcoming;
  const visiblePast = showAllPast ? past : past.slice(0, RECENT_PAST_LIMIT);

  return (
    <View style={{ gap: spacing[5] }}>
      <Text
        testID="group-sessions-scope"
        style={{
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.caption.fontSize,
        }}
      >
        Toutes tes séances · toutes disciplines
      </Text>

      {nextUp ? <NextUpCard assignment={nextUp} onPress={() => onOpen(nextUp)} /> : null}

      {laterUpcoming.length > 0 ? (
        <View style={{ gap: spacing[3] }}>
          <SectionTitle testID="group-upcoming-title">
            À venir · {laterUpcoming.length}
          </SectionTitle>
          {laterUpcoming.map((a) => (
            <GroupSessionRow key={a.id} assignment={a} onPress={() => onOpen(a)} />
          ))}
        </View>
      ) : null}

      {past.length > 0 ? (
        <View style={{ gap: spacing[3] }}>
          <SectionTitle testID="group-past-title">Passées</SectionTitle>
          {visiblePast.map((a) => (
            <GroupSessionRow key={a.id} assignment={a} onPress={() => onOpen(a)} />
          ))}
          {past.length > RECENT_PAST_LIMIT && !showAllPast ? (
            <Button
              testID="group-past-see-all"
              variant="ghost"
              onPress={() => setShowAllPast(true)}
            >
              {`Voir tout l'historique (${past.length})`}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
