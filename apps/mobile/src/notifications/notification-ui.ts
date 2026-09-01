import type { NotificationType } from '@talent-x/api-client';
import { COACH_DASHBOARD_QUERY_KEY } from '../dashboard/dashboard-query';
import {
  ASSIGNMENTS_QUERY_KEY,
  GROUPS_QUERY_KEY,
  groupAnnouncementsQueryKey,
} from '../groups/groups-query';

/**
 * Présentation des notifications in-app (TLX-111, ADR-23) — module pur.
 * Le backend n'envoie qu'un signal (type + resourceId) : libellés, icônes et
 * cibles de navigation sont composés ici, par type et par rôle.
 */

export interface NotificationPresentation {
  /** Icône Feather. */
  icon: 'calendar' | 'message-circle' | 'check-circle' | 'users' | 'volume-2';
  title: string;
  description: string;
}

export const NOTIFICATION_PRESENTATIONS: Record<NotificationType, NotificationPresentation> = {
  session_assigned: {
    icon: 'calendar',
    title: 'Nouvelle séance',
    description: 'Une séance t’a été affectée.',
  },
  performance_feedback: {
    icon: 'message-circle',
    title: 'Nouveau feedback',
    description: 'Ton coach a commenté une performance.',
  },
  performance_submitted: {
    icon: 'check-circle',
    title: 'Performance à revoir',
    description: 'Un athlète a soumis une performance.',
  },
  group_update: {
    icon: 'users',
    title: 'Groupe mis à jour',
    description: 'Un athlète a rejoint votre groupe.',
  },
  group_announcement: {
    icon: 'volume-2',
    title: 'Nouvelle annonce',
    description: 'Ton coach a publié une annonce.',
  },
  group_kudos: {
    icon: 'users',
    title: 'Un coéquipier t’encourage',
    description: 'Quelqu’un de ton groupe t’a envoyé des encouragements 👏.',
  },
  group_reply: {
    icon: 'message-circle',
    title: 'Nouvelle réponse',
    description: 'Quelqu’un a répondu à ton annonce.',
  },
  // ADR-59 : fil de séance, les deux sens (question d'athlète, réponse de coach).
  session_comment: {
    icon: 'message-circle',
    title: 'Nouveau message',
    description: 'Quelqu’un a écrit sur une séance.',
  },
};

/**
 * Description d'une notification (ADR-55) — **nominative** si l'acteur est résolu (feed in-app),
 * sinon **repli générique** (`NOTIFICATION_PRESENTATIONS[type].description`) pour les anciennes
 * notifications, les acteurs supprimés, ou l'absence de nom. Le titre + l'icône restent fixes.
 */
export function notificationDescription(type: NotificationType, actorName?: string): string {
  const fallback = NOTIFICATION_PRESENTATIONS[type].description;
  if (!actorName) return fallback;
  switch (type) {
    case 'session_assigned':
      return `${actorName} t’a affecté une séance.`;
    case 'performance_feedback':
      return `${actorName} a commenté ta performance.`;
    case 'performance_submitted':
      return `${actorName} a soumis une performance.`;
    case 'group_update':
      return `${actorName} a rejoint votre groupe.`;
    case 'group_announcement':
      return `${actorName} a publié une annonce.`;
    case 'group_kudos':
      return `${actorName} t’envoie des encouragements 👏.`;
    case 'group_reply':
      return `${actorName} a répondu à ton annonce.`;
    case 'session_comment':
      return `${actorName} a écrit sur une séance.`;
    default:
      return fallback;
  }
}

/**
 * Cible de navigation d'une notification, selon le rôle connecté.
 * resourceId = affectation (session_assigned, performance_feedback côté athlète ;
 * performance_submitted côté coach → revue C-08) ou groupe (group_update — pas
 * d'écran groupe dédié : liste des athlètes). `null` si la notification n'est pas
 * navigable pour ce rôle (sécurité d'affichage).
 */
export function notificationHref(
  role: 'athlete' | 'coach',
  type: NotificationType,
  resourceId: string,
): { pathname: string; params?: Record<string, string> } | null {
  if (role === 'athlete' && (type === 'session_assigned' || type === 'performance_feedback')) {
    return { pathname: '/(athlete)/session/[id]', params: { id: resourceId } };
  }
  if (role === 'coach' && type === 'performance_submitted') {
    return { pathname: '/(coach)/review/[id]', params: { id: resourceId } };
  }
  if (role === 'coach' && type === 'group_update') {
    return { pathname: '/(coach)/athletes' };
  }
  // Annonce (ADR-46) : resourceId = groupe → l'athlète ouvre le hub du groupe.
  if (role === 'athlete' && type === 'group_announcement') {
    return { pathname: '/(athlete)/group/[id]', params: { id: resourceId } };
  }
  // Kudos (ADR-49, amendé TLX-266) : resourceId = **affectation**, comme les autres types que
  // cette route sert. Elle s'appelle `session/[id]` mais consomme une affectation — le nom a
  // induit ADR-49 en erreur, et le tap tombait sur un écran d'erreur.
  if (role === 'athlete' && type === 'group_kudos') {
    return { pathname: '/(athlete)/session/[id]', params: { id: resourceId } };
  }
  // Réponse de fil (ADR-50) : resourceId = groupe ; l'auteur de l'annonce est le coach → son groupe.
  if (role === 'coach' && type === 'group_reply') {
    return { pathname: '/(coach)/group/[id]', params: { id: resourceId } };
  }
  /*
   * Fil de séance (ADR-59 §D3) — les deux routes s'appellent `session/[id]` et **ne prennent pas
   * la même chose** : celle du coach consomme un identifiant de séance, celle de l'athlète une
   * affectation. L'émetteur envoie donc à chaque destinataire la ressource que *son* écran sait
   * ouvrir ; ici on se contente de router selon le rôle. C'est la leçon de TLX-266, où un
   * identifiant unique partagé menait l'un des deux camps sur un écran d'erreur.
   */
  if (type === 'session_comment') {
    return role === 'coach'
      ? { pathname: '/(coach)/session/[id]', params: { id: resourceId } }
      : { pathname: '/(athlete)/session/[id]', params: { id: resourceId } };
  }
  return null;
}

/**
 * Détail d'une affectation et tout ce qui en dépend (TLX-235). Préfixe **singulier**
 * `['assignment', id]` : c'est celui du détail de séance et de la revue coach, qui porte
 * aussi `…, 'performance'`, `…, 'attendance-summary'` et `…, 'teammates-attendance'`.
 * L'invalidation TanStack se faisant par préfixe, les descendants suivent — inutile de les
 * énumérer.
 *
 * À ne pas confondre avec `assignmentQueryKey()` de `groups-query`, au **pluriel**
 * (`['assignments', id]`), utilisé par le contrôle de présence : celui-là est couvert par
 * `ASSIGNMENTS_QUERY_KEY`, préfixe de la liste.
 */
function assignmentDetailKey(assignmentId: string): readonly unknown[] {
  return ['assignment', assignmentId];
}

/**
 * Fils de commentaires de performance (`['performance', <id>, 'comments']`, cf.
 * `performanceCommentsKey`). Le préfixe racine est volontaire : une notification de
 * feedback porte l'identifiant de l'**affectation**, jamais celui de la performance — il
 * est impossible de viser le fil précis sans requête. Seuls les fils réellement montés
 * seront rechargés ; les autres sont simplement marqués périmés.
 */
const PERFORMANCE_COMMENTS_PREFIX: readonly unknown[] = ['performance'];

/**
 * Séances et leurs fils de discussion (`['session', <sessionId>, 'comments']`, cf.
 * `sessionCommentsKey`) — même raison que ci-dessus : côté athlète, la notification de fil de
 * séance porte l'identifiant de l'**affectation**, jamais celui de la séance. Le préfixe racine
 * emporte au passage le détail de séance coach, qui est la cible de son côté (ADR-59 §D3).
 */
const SESSION_COMMENTS_PREFIX: readonly unknown[] = ['session'];

/**
 * Clés de cache à invalider à l'**arrivée** d'une notification (TLX-235), dérivées du seul
 * signal disponible : `type` + `resourceId` (ADR-23). Sans elles, l'app annonçait un
 * événement qu'elle n'affichait pas — la cloche s'incrémentait, la ressource restait figée.
 *
 * Fonction **pure**, à côté de `notificationHref` qui dérive la navigation du même signal.
 *
 * Deux rappels qui expliquent la forme des clés :
 *  - l'invalidation se fait **par préfixe** : `['assignment', id]` emporte ses descendants ;
 *  - `staleTime` ne déclenche **aucun** refetch, et sans observateur monté une invalidation
 *    se borne à marquer la clé périmée — d'où l'absence de garde sur le rôle : le coach et
 *    l'athlète peuvent recevoir les mêmes types sans qu'aucune requête inutile ne parte.
 */
export function notificationQueryKeys(
  type: NotificationType,
  resourceId: string,
): readonly (readonly unknown[])[] {
  switch (type) {
    // Une séance de plus dans la liste de l'athlète (accueil, Séances, calendrier).
    case 'session_assigned':
      return [ASSIGNMENTS_QUERY_KEY];

    // Le coach a commenté : le fil vit sous `['performance', <perfId>, 'comments']`, pas
    // sous l'affectation — invalider la seule affectation rafraîchirait la perf sans jamais
    // faire apparaître le commentaire, c'est-à-dire tout sauf ce que la notification annonce.
    case 'performance_feedback':
      return [assignmentDetailKey(resourceId), PERFORMANCE_COMMENTS_PREFIX];

    // Perf soumise par un athlète : revue coach (détail + perf) et les agrégats qui la
    // comptent — tableau de bord « à revoir », liste des séances, historique complété.
    case 'performance_submitted':
      return [
        assignmentDetailKey(resourceId),
        COACH_DASHBOARD_QUERY_KEY,
        ASSIGNMENTS_QUERY_KEY,
        ['coach', 'assignments', 'completed'],
      ];

    // Adhésion à un groupe : la liste (effectifs) et le détail. `['groups']` est le préfixe
    // commun aux deux — et à `['groups', 'mine']` côté athlète, sans effet là où rien n'est monté.
    // Une adhésion fait aussi entrer l'athlète dans `GET /coach/dashboard` : sans cette
    // seconde clé, l'écran « Athlètes » du coach exigeait encore un rafraîchissement manuel
    // quand la liste des groupes, elle, se mettait à jour seule sur le même push (mesuré sur
    // appareil le 19/08 — les deux écrans, un seul `group_update`).
    case 'group_update':
      return [GROUPS_QUERY_KEY, COACH_DASHBOARD_QUERY_KEY];

    // Annonce (ADR-46) : resourceId = groupe.
    case 'group_announcement':
      return [groupAnnouncementsQueryKey(resourceId)];

    // Kudos (ADR-49, amendé TLX-266) : resourceId = affectation ; les 👏 vivent sous
    // `['assignment', id, 'teammates-attendance']`, couvert par le préfixe. Ce commentaire
    // décrivait déjà l'affectation alors que le serveur émettait une séance : la clé produite
    // ne correspondait à aucune requête montée, donc l'invalidation à l'arrivée du push
    // (TLX-235) était inerte pour les kudos. Il est vrai depuis que l'émetteur l'est.
    case 'group_kudos':
      return [assignmentDetailKey(resourceId)];

    // Réponse de fil (ADR-50) : resourceId = groupe, sans l'identifiant de l'annonce. Le
    // préfixe des annonces couvre à la fois la liste (son `replyCount`) et tous les fils.
    case 'group_reply':
      return [groupAnnouncementsQueryKey(resourceId)];

    // Fil de séance (ADR-59). Le `resourceId` est l'affectation côté athlète, la séance côté
    // coach : on invalide donc le détail d'affectation **et** le préfixe racine des séances.
    //
    // Ce dernier est volontairement large, pour la raison exacte de `PERFORMANCE_COMMENTS_PREFIX`
    // ci-dessus : le fil vit sous `['session', <sessionId>, 'comments']`, et la notification de
    // l'athlète ne porte pas le `sessionId` — viser le fil précis demanderait une requête. Seuls
    // les fils réellement montés sont rechargés ; les autres sont marqués périmés, sans coût.
    // Sans cette clé, la notification annoncerait un message que l'écran n'afficherait pas —
    // le défaut même de TLX-235.
    case 'session_comment':
      return [assignmentDetailKey(resourceId), SESSION_COMMENTS_PREFIX];

    default:
      return [];
  }
}

/** Date relative compacte (fr) : « à l'instant », « il y a 3 h », « hier », « 8 juin ». */
export function formatRelativeDate(iso: string, now: Date): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}
