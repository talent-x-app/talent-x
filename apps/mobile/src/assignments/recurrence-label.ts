/**
 * Libellé du jour de semaine d'une date `YYYY-MM-DD` (récurrence d'assignation, ADR-35).
 * Utilisé par l'écran d'assignation pour afficher « Répéter chaque <jour> ». Calcul en
 * **UTC** (aligné sur les `dueDate` calendaires de l'app), pur et testable. Renvoie `null`
 * si la date est vide ou mal formée (l'UI masque alors l'option de répétition).
 */
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const;

export function weekdayLabel(date: string): string | null {
  const trimmed = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime()) || dt.getUTCMonth() !== m - 1) return null;
  return WEEKDAYS[dt.getUTCDay()];
}
