import type { Href } from 'expo-router';

/**
 * Routes empilées des compétitions (ADR-24 §5 — pas de 6ᵉ onglet ; accès depuis le
 * Calendrier et les listes). Centralise les chemins pour éviter les littéraux dispersés.
 */

/** Liste des compétitions du coach (C — TLX-101). */
export function coachCompetitionsHref(): Href {
  return '/(coach)/competitions';
}

/** Constructeur : création d'une compétition (coach). */
export function competitionNewHref(): Href {
  return '/(coach)/competition/new';
}

/** Constructeur : édition d'une compétition existante (coach). */
export function competitionEditHref(id: string): Href {
  return { pathname: '/(coach)/competition/[id]', params: { id } };
}

/** Écran d'engagement multi-athlètes d'une compétition (coach). */
export function competitionEngageHref(id: string): Href {
  return { pathname: '/(coach)/competition/[id]/engage', params: { id } };
}

/** Liste des compétitions de l'athlète (engagements). */
export function athleteCompetitionsHref(): Href {
  return '/(athlete)/competitions';
}

/** Détail d'une compétition (athlète, lecture seule). */
export function athleteCompetitionDetailHref(id: string): Href {
  return { pathname: '/(athlete)/competition/[id]', params: { id } };
}
