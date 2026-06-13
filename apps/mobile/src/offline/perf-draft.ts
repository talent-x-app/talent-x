/**
 * Brouillon de saisie de performance (TLX-077, TX-ARCH-001 §6.2) — auto-sauvegarde locale.
 *
 * La saisie de perf se fait souvent en mauvaise connectivité (salle, terrain). Pour ne
 * **jamais perdre** une saisie en cours (app tuée, batterie, changement d'écran), l'état
 * d'entrée (`entries`/`rpe`/`notes`) est persisté localement, par affectation, pendant la
 * saisie, puis **restauré** à la réouverture de l'écran. Le brouillon est purgé une fois la
 * perf confirmée par le serveur (cf. file d'écriture `perf-outbox`).
 *
 * Aucune IO ici n'est impure au-delà du `KeyValueStore` injecté → entièrement testable.
 */
import type { ExerciseEntry } from '../athlete/perf-entry';
import type { KeyValueStore } from './key-value-store';

const DRAFT_PREFIX = 'perf-draft:';

/** Tampon de saisie d'une perf : aligné 1:1 sur les feuilles d'exercice de la séance. */
export interface PerfDraft {
  entries: ExerciseEntry[];
  rpe: number;
  notes: string;
  /** Horodatage ISO de la dernière sauvegarde (départage / affichage éventuel). */
  savedAt: string;
}

/** Clé de stockage d'un brouillon, cloisonnée par affectation. */
export function draftKey(assignmentId: string): string {
  return `${DRAFT_PREFIX}${assignmentId}`;
}

/** Sérialise un brouillon (l'`ExerciseEntry` est déjà du JSON simple). */
export function serializeDraft(draft: PerfDraft): string {
  return JSON.stringify(draft);
}

/**
 * Relit un brouillon sérialisé — **défensif** : JSON corrompu ou forme inattendue → `null`
 * (on ne restaure jamais un état douteux qui casserait l'écran de saisie).
 */
export function parseDraft(raw: string | null | undefined): PerfDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PerfDraft> | null;
    if (
      !value ||
      !Array.isArray(value.entries) ||
      typeof value.rpe !== 'number' ||
      typeof value.notes !== 'string'
    ) {
      return null;
    }
    return {
      entries: value.entries as ExerciseEntry[],
      rpe: value.rpe,
      notes: value.notes,
      savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
    };
  } catch {
    return null;
  }
}

export async function saveDraft(
  store: KeyValueStore,
  assignmentId: string,
  draft: PerfDraft,
): Promise<void> {
  await store.setItem(draftKey(assignmentId), serializeDraft(draft));
}

export async function loadDraft(
  store: KeyValueStore,
  assignmentId: string,
): Promise<PerfDraft | null> {
  return parseDraft(await store.getItem(draftKey(assignmentId)));
}

export async function clearDraft(store: KeyValueStore, assignmentId: string): Promise<void> {
  await store.removeItem(draftKey(assignmentId));
}
