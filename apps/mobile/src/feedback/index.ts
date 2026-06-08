/**
 * Feedback global de l'app (TLX-010) : garde-fou de rendu, toasts, bandeau
 * hors-ligne et traduction des erreurs en messages utilisateur.
 */
export { ErrorBoundary } from './ErrorBoundary';
export { ToastProvider, useToast } from './ToastProvider';
export { Toast, type ToastProps } from './Toast';
export { OfflineBanner } from './OfflineBanner';
export { useNetworkStatus } from './useNetworkStatus';
export { toUserMessage, type UserMessage } from './error-message';
export { emitToast, setToastHandler } from './toast-bridge';
export { type ToastOptions, type ToastVariant, type ToastItem } from './types';
