import { SessionStatus, type DashboardAthlete } from '@talent-x/api-client';
import { athleteFullName } from './athlete-ui';
import { type DisciplineKey } from './discipline-assistants';

/**
 * Cible de navigation vers le détail athlète (C-03). L'identité (nom, statut, sport)
 * est passée en paramètres pour un rendu immédiat : `GET /athletes/:id/stats` ne
 * renvoie que les métriques, pas l'identité.
 */
export function athleteDetailHref(athlete: DashboardAthlete) {
  return {
    pathname: '/(coach)/athlete/[id]' as const,
    params: {
      id: athlete.id,
      name: athleteFullName(athlete),
      status: athlete.status,
      sport: athlete.sport ?? '',
    },
  };
}

/**
 * Cible de navigation vers l'écran d'assignation (C-06/C-07, TLX-063). Le titre de la séance
 * est passé en paramètre pour un rendu immédiat (l'écran ne recharge pas la séance).
 *
 * `fromCreate` (TLX-198) : marque l'arrivée **post-création** (le builder a fait `replace` vers ici).
 * Le « Retour » de l'écran d'assignation devient alors déterministe (→ accueil), au lieu de
 * `router.back()` qui, en historique navigateur, retombe dans les écrans de création.
 *
 * `scheduledDate` : **pré-remplit l'échéance** avec la date planifiée de la séance (la date saisie
 * à la création est l'échéance par défaut, modifiable). Absent ⇒ échéance vide.
 */
export function assignSessionHref(
  sessionId: string,
  sessionTitle?: string,
  fromCreate = false,
  scheduledDate?: string | null,
) {
  return {
    pathname: '/(coach)/assign/[id]' as const,
    params: {
      id: sessionId,
      title: sessionTitle ?? '',
      ...(fromCreate ? { from: 'create' } : {}),
      ...(scheduledDate ? { dueDate: scheduledDate } : {}),
    },
  };
}

/** Accueil coach (onglet dashboard). Destination « sortie » d'un flux empilé hors tab bar. */
export function coachHomeHref() {
  return '/(coach)' as const;
}

/** Détail d'une séance en **lecture seule** (consultation, mode par défaut côté coach). */
export function coachSessionDetailHref(sessionId: string) {
  return { pathname: '/(coach)/session/[id]' as const, params: { id: sessionId } };
}

/** Édition d'une séance (constructeur C-05) — depuis le détail lecture seule. */
export function editSessionHref(sessionId: string) {
  return { pathname: '/(coach)/session/[id]/edit' as const, params: { id: sessionId } };
}

/** Bibliothèque de modèles de séance (C-10, ADR-29). */
export function coachTemplatesHref() {
  return '/(coach)/templates' as const;
}

/**
 * Constructeur ouvert en **mode modèle** (C-10) : `session/new` avec le statut `template`
 * pré-sélectionné. Le constructeur masque alors la date et l'assignation (ADR-29).
 */
export function newTemplateHref() {
  return { pathname: '/(coach)/session/new' as const, params: { status: SessionStatus.template } };
}

/**
 * Assistant de création par discipline (ADR-38, TLX-155→159) : ouvre le formulaire guidé en
 * séries de la discipline choisie depuis l'écran « Nouvelle séance ».
 */
export function disciplineAssistantHref(discipline: DisciplineKey) {
  return { pathname: '/(coach)/session/assistant/[discipline]' as const, params: { discipline } };
}

/**
 * Constructeur générique (C-05) ouvert depuis « Nouvelle séance » via l'option « Personnalisé ».
 * `mode=custom` court-circuite l'écran de choix de discipline (ADR-38) pour aller directement au
 * canvas de blocs libre.
 */
export function customSessionHref() {
  return { pathname: '/(coach)/session/new' as const, params: { mode: 'custom' } };
}
