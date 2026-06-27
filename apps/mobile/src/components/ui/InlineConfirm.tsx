import { Text, View } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';
import { Button } from './Button';

export interface InlineConfirmProps {
  message: string;
  confirmLabel: string;
  confirmTestID: string;
  /** Variante destructive (rouge) pour les actions irréversibles. */
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation **inline** réutilisable (Annuler / action) — robuste web + natif, sans modale.
 * Extrait de `CoachGroupDetailScreen` (zone danger / révocation de code) pour mutualiser le patron
 * d'action destructive (suppression de groupe, de séance…).
 */
export function InlineConfirm({
  message,
  confirmLabel,
  confirmTestID,
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: InlineConfirmProps) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ gap: spacing[3] }}>
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
          textAlign: 'center',
        }}
      >
        {message}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" fullWidth disabled={loading} onPress={onCancel}>
            Annuler
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            testID={confirmTestID}
            variant={danger ? 'danger' : 'primary'}
            fullWidth
            loading={loading}
            onPress={onConfirm}
          >
            {confirmLabel}
          </Button>
        </View>
      </View>
    </View>
  );
}
