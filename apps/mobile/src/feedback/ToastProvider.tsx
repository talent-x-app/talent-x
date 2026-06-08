/**
 * Système de toasts global (TLX-010).
 *
 * Fournit `useToast()` (API impérative `show`/`dismiss`) et rend la file de
 * toasts en superposition basse de l'écran (au-dessus du contenu, sans bloquer
 * les taps grâce à `pointerEvents="box-none"`). Enregistre aussi un pont
 * (`toast-bridge`) pour que le code hors-React (gestion d'erreurs TanStack
 * Query) puisse émettre des toasts.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@talent-x/design-tokens';
import { Toast } from './Toast';
import { setToastHandler } from './toast-bridge';
import { type ToastItem, type ToastOptions } from './types';

const DEFAULT_DURATION = 4000;
/** Nombre max de toasts simultanés (les plus anciens sont évincés). */
const MAX_VISIBLE = 3;

interface ToastApi {
  /** Affiche un toast et renvoie son identifiant. */
  show: (options: ToastOptions) => string;
  /** Rejette un toast par identifiant. */
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Identifiant monotone (stable entre rendus).
  const seq = useRef(0);
  // Timers d'auto-rejet, pour nettoyage au démontage.
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (options: ToastOptions): string => {
      const id = `toast-${++seq.current}`;
      const item: ToastItem = {
        id,
        title: options.title,
        description: options.description,
        variant: options.variant ?? 'info',
        duration: options.duration,
      };
      setToasts((prev) => [...prev, item].slice(-MAX_VISIBLE));

      const duration = options.duration ?? DEFAULT_DURATION;
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Branche le pont pour le code hors-React le temps du montage du provider.
  useEffect(() => {
    setToastHandler(show);
    return () => setToastHandler(null);
  }, [show]);

  // Nettoyage de tous les timers au démontage.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: spacing[4],
          right: spacing[4],
          bottom: insets.bottom + spacing[4],
          gap: spacing[2],
        }}
      >
        {toasts.map((t) => (
          <Toast
            key={t.id}
            testID={`toast-${t.variant}`}
            title={t.title}
            description={t.description}
            variant={t.variant}
            onDismiss={() => dismiss(t.id)}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

/** API impérative des toasts. À utiliser sous `<ToastProvider>`. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
