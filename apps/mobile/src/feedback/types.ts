/** Types partagés du système de feedback (toasts) — TLX-010. */

export type ToastVariant = 'success' | 'danger' | 'warning' | 'info';

/** Options pour afficher un toast. `duration: 0` rend le toast persistant. */
export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Durée d'affichage en ms avant disparition auto. Défaut 4000 ; 0 = persistant. */
  duration?: number;
}

/** Toast matérialisé dans la file (variante résolue + identifiant). */
export interface ToastItem extends ToastOptions {
  id: string;
  variant: ToastVariant;
}
