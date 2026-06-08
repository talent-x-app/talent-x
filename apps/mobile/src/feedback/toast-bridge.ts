/**
 * Pont vers le système de toasts pour le code hors-React (TLX-010).
 *
 * Le `QueryClient` (TanStack Query) est créé en dehors de l'arbre React et ne
 * peut donc pas appeler `useToast()`. Le `ToastProvider` enregistre ici son
 * `show` au montage ; les gestionnaires d'erreurs globaux émettent via
 * `emitToast`. Avant l'enregistrement (ou après démontage), l'émission est
 * simplement ignorée — jamais d'exception.
 */
import { type ToastOptions } from './types';

type ToastHandler = (options: ToastOptions) => void;

let handler: ToastHandler | null = null;

/** Branche le présentateur de toasts (appelé par ToastProvider). */
export function setToastHandler(fn: ToastHandler | null): void {
  handler = fn;
}

/** Émet un toast depuis du code non-React. Ignoré si aucun présentateur monté. */
export function emitToast(options: ToastOptions): void {
  handler?.(options);
}
