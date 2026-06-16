import { parseCalendarDate } from '../dates/calendar-date';

/**
 * Libellé du jour de semaine d'une date `YYYY-MM-DD` (récurrence d'assignation, ADR-35).
 * Utilisé par l'écran d'assignation pour afficher « Répéter chaque <jour> ». Calcul en
 * **UTC** (aligné sur les `dueDate` calendaires de l'app), pur et testable. Renvoie `null`
 * si la date est vide ou mal formée (l'UI masque alors l'option de répétition).
 */
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const;

export function weekdayLabel(date: string): string | null {
  const dt = parseCalendarDate(date);
  if (dt === null) return null;
  return WEEKDAYS[dt.getUTCDay()];
}
