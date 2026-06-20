import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';

export interface SegmentedTabItem {
  key: string;
  label: string;
  /** Pastille de notification (point d'accent) sur l'onglet. */
  badge?: boolean;
}

export interface SegmentedTabsProps {
  items: SegmentedTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Sélecteur d'onglets **segmenté** du design system (maquette `.seg`) — accessible
 * (`tablist` / `tab` + `selected`), cibles ≥ `touchTarget` (44px, TLX-145). Présentationnel : la
 * sélection est pilotée par l'appelant. Utilisé par le hub de groupe (Séances / Calendrier /
 * Coéquipiers / Infos). Distinct de `SegmentedControl` (toggle de mode, rôle bouton) et de la
 * `TabBar` de bas d'écran.
 */
export function SegmentedTabs({ items, activeKey, onChange, style, testID }: SegmentedTabsProps) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: 'row',
          backgroundColor: colors.surfaceSunken,
          borderRadius: radius.md,
          borderWidth: borderWidth.hairline,
          borderColor: colors.border,
          padding: spacing[1],
          gap: spacing[1],
        },
        style,
      ]}
    >
      {items.map((item) => {
        const focused = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            testID={testID ? `${testID}-${item.key}` : undefined}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={item.label}
            style={{
              flex: 1,
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing[1],
              borderRadius: radius.sm,
              backgroundColor: focused ? colors.surfaceRaised : 'transparent',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: focused ? colors.textPrimary : colors.textSecondary,
                fontFamily: focused ? typography.fontFamily.semibold : typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {item.label}
            </Text>
            {item.badge ? (
              <View
                testID={testID ? `${testID}-${item.key}-badge` : undefined}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: radius.pill,
                  backgroundColor: colors.accent,
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
