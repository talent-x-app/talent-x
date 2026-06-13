import type { NotificationType } from '@talent-x/api-client';

/**
 * Présentation des notifications in-app (TLX-111, ADR-23) — module pur.
 * Le backend n'envoie qu'un signal (type + resourceId) : libellés, icônes et
 * cibles de navigation sont composés ici, par type et par rôle.
 */

export interface NotificationPresentation {
  /** Icône Feather. */
  icon: 'calendar' | 'message-circle' | 'check-circle' | 'users';
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
};

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
  return null;
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
