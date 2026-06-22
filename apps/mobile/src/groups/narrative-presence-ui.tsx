import {
  getAttendanceSummary,
  listAssignments,
  type Assignment,
  type AttendanceSummary,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { Card } from '../components/ui';
import { ASSIGNMENTS_QUERY_KEY } from './groups-query';

/**
 * Présence sociale **narrative** (ADR-48, Palier 1 — « slice 4 ») — habillage chaleureux de
 * l'agrégat de présence (ADR-45) sur la **prochaine séance du groupe** : « 5 coéquipiers
 * t'attendent jeudi ». **Compteur seul** (jamais de noms — frontière RGPD ADR-43 §5) ; l'exclusion
 * de soi utilise sa **propre** réponse RSVP. Athlète uniquement (coachId du groupe requis).
 * Silencieuse s'il n'y a pas de prochaine séance ou si personne d'autre n'a confirmé.
 */
export function NarrativePresenceBanner({
  coachId,
  now = new Date(),
}: {
  coachId: string;
  now?: Date;
}) {
  const { colors, typography, spacing } = useTheme();

  const assignments = useQuery({
    queryKey: ASSIGNMENTS_QUERY_KEY,
    queryFn: async (): Promise<Assignment[]> => {
      const response = await listAssignments();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const next = nextGroupSession(assignments.data ?? [], coachId, now);

  // L'agrégat de présence n'est interrogé que s'il y a une prochaine séance (clé partagée avec
  // la ligne d'agrégat du détail séance → cache mutualisé, rafraîchi par les déclarations RSVP).
  const summary = useQuery({
    queryKey: ['assignment', next?.id, 'attendance-summary'],
    enabled: next != null,
    queryFn: async (): Promise<AttendanceSummary> => {
      const response = await getAttendanceSummary(next!.id);
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  if (!next || !summary.data) return null;

  // « Coéquipiers » = présents confirmés hors soi (on retire sa propre réponse « going »).
  const selfGoing = next.attendance === 'going';
  const teammatesGoing = summary.data.going - (selfGoing ? 1 : 0);
  if (teammatesGoing < 1) return null;

  const day = relativeDayLabel(next.session?.scheduledDate, now);
  const title = next.session?.title?.trim();
  const plural = teammatesGoing > 1 ? 's' : '';
  const lead = selfGoing
    ? `${teammatesGoing} coéquipier${plural} seront là avec toi`
    : `${teammatesGoing} coéquipier${plural} t'attendent`;
  const tail = [day, title].filter(Boolean).join(' · ');

  return (
    <Card testID="narrative-presence">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Text style={{ fontSize: typography.h3.fontSize }}>💪</Text>
        <Text
          testID="narrative-presence-text"
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.body.fontSize,
            lineHeight: 21,
          }}
        >
          <Text style={{ fontFamily: typography.fontFamily.bold }}>{lead}</Text>
          {tail ? ` ${tail}.` : '.'}
          {selfGoing ? '' : ' Sois-en. 🔥'}
        </Text>
      </View>
    </Card>
  );
}

/**
 * Prochaine séance **du groupe** (coach = `coachId`) planifiée à venir, la plus proche. Exclut les
 * séances libres de l'athlète (coachId = athleteId) et les séances passées (ADR-47 §3, même filtre
 * que le calendrier de groupe).
 */
function nextGroupSession(
  assignments: Assignment[],
  coachId: string,
  now: Date,
): Assignment | null {
  const today = startOfDay(now).getTime();
  const upcoming = assignments
    .filter((a) => a.session?.coachId === coachId && a.session?.scheduledDate)
    .filter((a) => new Date(a.session!.scheduledDate as string).getTime() >= today)
    .sort(
      (x, y) =>
        new Date(x.session!.scheduledDate as string).getTime() -
        new Date(y.session!.scheduledDate as string).getTime(),
    );
  return upcoming[0] ?? null;
}

/** Libellé jour : « aujourd'hui » / « demain » / jour de semaine (≤ 7 j) / date courte au-delà. */
function relativeDayLabel(iso: string | undefined, now: Date): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  if (days < 7) return date.toLocaleDateString('fr-FR', { weekday: 'long' });
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
