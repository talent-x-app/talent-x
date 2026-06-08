/**
 * Garde-fou de rendu global (TLX-010).
 *
 * Capture les erreurs de rendu React non rattrapées et affiche un écran de
 * repli avec un bouton « Réessayer » (réinitialise l'état d'erreur pour
 * retenter le rendu). Les erreurs asynchrones (requêtes) sont gérées par les
 * toasts ; ce garde-fou couvre les exceptions de rendu.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';
import { Button } from '../components/ui';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Repli présentationnel (composant fonctionnel pour accéder aux tokens via hook). */
function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View
      testID="error-boundary-fallback"
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing[6],
        gap: spacing[4],
      }}
    >
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.h3.fontSize,
          textAlign: 'center',
        }}
      >
        Une erreur est survenue
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
          textAlign: 'center',
        }}
      >
        L&apos;application a rencontré un problème inattendu. Vous pouvez réessayer.
      </Text>
      <Button onPress={onRetry}>Réessayer</Button>
    </View>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Journalisation locale ; un rapport d'erreurs distant relèvera d'un ticket dédié.
    console.error('ErrorBoundary a capturé une erreur', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return <ErrorFallback onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
