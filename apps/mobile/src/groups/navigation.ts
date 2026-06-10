import type { Href } from 'expo-router';

/**
 * Routes empilées des groupes (TLX-87/88) — pas de 6ᵉ onglet : accès depuis le
 * dashboard / l'écran Athlètes (coach) et le Profil / l'accueil (athlète).
 * Centralise les chemins pour éviter les littéraux dispersés.
 */

/** Liste « Mes groupes » du coach. */
export function coachGroupsHref(): Href {
  return '/(coach)/groups';
}

/** Détail/gestion d'un groupe (coach). */
export function groupDetailHref(id: string): Href {
  return { pathname: '/(coach)/group/[id]', params: { id } };
}

/** Feuille « Rejoindre un groupe » via code (athlète). */
export function joinGroupHref(): Href {
  return '/(athlete)/group/join';
}
