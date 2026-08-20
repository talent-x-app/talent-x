import { SessionStatus } from '@talent-x/api-client';

/**
 * Tonalité de rendu d'un statut de séance. Mêmes valeurs que `CalendarTone` (calendar-model) —
 * les deux unions sont structurellement identiques, donc interchangeables sans conversion.
 */
export type SessionStatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

/**
 * Libellé + tonalité par statut de séance. **Source unique** du libellé : le calendrier (A-08/C-09),
 * le détail coach et la liste athlète le lisent tous ici.
 *
 * Extrait de `calendar-model.ts` par TLX-249 : la liste des séances athlète a besoin du libellé
 * « Séance libre », et `calendar-model` importe déjà `athlete-session-ui` — l'y laisser aurait
 * imposé soit un cycle d'imports, soit un second libellé pour le même concept.
 */
export const SESSION_STATUS_META: Record<
  SessionStatus,
  { label: string; tone: SessionStatusTone }
> = {
  [SessionStatus.draft]: { label: 'Brouillon', tone: 'neutral' },
  [SessionStatus.published]: { label: 'Publiée', tone: 'accent' },
  [SessionStatus.archived]: { label: 'Archivée', tone: 'neutral' },
  // Les modèles (C-10, ADR-29) sont filtrés en amont du calendrier ; entrée présente pour la
  // complétude du type (un modèle n'apparaît jamais comme entrée planifiée).
  [SessionStatus.template]: { label: 'Modèle', tone: 'neutral' },
  // Séance libre athlète (TLX-111, ADR-36) : appartient à l'athlète (coach_id = athlète) ;
  // n'apparaît pas dans le calendrier coach, mais est étiquetée dans la liste athlète (TLX-249).
  [SessionStatus.self_logged]: { label: 'Séance libre', tone: 'neutral' },
};
