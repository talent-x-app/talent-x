import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { Pressable, TextInput, View } from 'react-native';

/**
 * Champ de recherche du design system (TLX-117) : icône loupe, saisie, et bouton
 * d'effacement (×) quand le texte n'est pas vide. Contrôlé par le parent.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  testID = 'search-field',
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  testID?: string;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        height: 44,
        paddingHorizontal: spacing[3],
        borderRadius: radius.sm,
        borderWidth: borderWidth.hairline,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
      }}
    >
      <Feather name="search" size={18} color={colors.textMuted} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{
          flex: 1,
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.body.fontSize,
          padding: 0,
        }}
      />
      {value.length > 0 ? (
        <Pressable
          testID={`${testID}-clear`}
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Effacer la recherche"
          hitSlop={spacing[2]}
        >
          <Feather name="x" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
