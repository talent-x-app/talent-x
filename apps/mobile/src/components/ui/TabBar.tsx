import { type ReactNode } from 'react';
import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';

export interface TabBarItem {
  key: string;
  label: string;
  /** Icône optionnelle ; reçoit la couleur et l'état actif courants. */
  renderIcon?: (props: { color: string; focused: boolean; size: number }) => ReactNode;
}

export interface TabBarProps {
  items: TabBarItem[];
  activeKey: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Barre d'onglets de bas d'écran du design system (TLX-006), présentationnelle
 * (réutilisable par expo-router ou en autonome). Onglet actif accentué.
 */
export function TabBar({ items, activeKey, onChange, style, testID }: TabBarProps) {
  const theme = useTheme();
  const { colors, typography, spacing, borderWidth, iconSize } = theme;

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: 'row',
          backgroundColor: colors.surface,
          borderTopWidth: borderWidth.hairline,
          borderTopColor: colors.border,
          paddingTop: spacing[2],
          paddingBottom: spacing[2],
          paddingHorizontal: spacing[1],
        },
        style,
      ]}
    >
      {items.map((item) => {
        const focused = item.key === activeKey;
        const color = focused ? colors.accentText : colors.textMuted;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={item.label}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing[1],
              minHeight: theme.touchTarget,
              paddingVertical: spacing[1],
            }}
          >
            {item.renderIcon?.({ color, focused, size: iconSize.sm })}
            <Text
              numberOfLines={1}
              style={{
                color,
                fontFamily: focused ? typography.fontFamily.semibold : typography.fontFamily.medium,
                fontSize: typography.caption.fontSize,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
