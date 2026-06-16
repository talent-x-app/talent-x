/**
 * Validation d'une date calendaire `YYYY-MM-DD` saisie au clavier (champs date des écrans
 * coach : constructeur de séance, assignation, compétitions…). **Source unique de vérité** de
 * la validité d'une date saisie — `weekdayLabel` (récurrence ADR-35) et les constructeurs la
 * réutilisent au lieu de re-tester une regex localement (qui acceptait des jours impossibles
 * comme `2026-02-30` ou `2026-13-45`, repoussés en 400 opaque côté API `@IsDateString()`).
 *
 * Calcul en **UTC**, aligné sur les clés jour calendaires de l'app (cf. `calendar-model`).
 * Pur et testable.
 */
const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse une date calendaire `YYYY-MM-DD` en `Date` UTC à minuit, ou `null` si la chaîne est
 * mal formée **ou** désigne un jour inexistant. La chaîne est trimée au préalable. On rejette
 * les débordements silencieusement renormalisés par `Date` (`2026-02-30` → 2 mars, mois `13`
 * → janvier suivant) en revérifiant que l'année, le mois et le jour reconstruits collent.
 */
export function parseCalendarDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!CALENDAR_DATE_RE.test(trimmed)) return null;
  const [y, m, d] = trimmed.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

/** Vrai si `value` est une date calendaire `YYYY-MM-DD` réellement existante. */
export function isValidCalendarDate(value: string): boolean {
  return parseCalendarDate(value) !== null;
}
