import { useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  PanResponder,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@talent-x/design-tokens';

const THUMB_SIZE = 22;
const TRACK_HEIGHT = 8;

export interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Slider du design system (TLX-006) — ex. RPE 1..10. Piloté au geste via
 * PanResponder (aucune dépendance native), valeur discrétisée par `step`.
 * Accessible : rôle « adjustable » + actions incrémenter/décrémenter.
 */
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 10,
  step = 1,
  disabled = false,
  style,
  testID,
  accessibilityLabel,
}: SliderProps) {
  const theme = useTheme();
  const { colors, radius } = theme;

  const [trackWidth, setTrackWidth] = useState(0);
  const widthRef = useRef(0);
  // Réfs pour exposer les dernières props/largeur au PanResponder (créé une fois).
  const stateRef = useRef({ min, max, step, disabled, onValueChange });
  stateRef.current = { min, max, step, disabled, onValueChange };

  const emitFromX = (x: number): void => {
    const { min: lo, max: hi, step: s, disabled: off, onValueChange: cb } = stateRef.current;
    if (off) return;
    const usable = Math.max(1, widthRef.current - THUMB_SIZE);
    const ratio = clamp((x - THUMB_SIZE / 2) / usable, 0, 1);
    const raw = lo + ratio * (hi - lo);
    cb(clamp(Math.round(raw / s) * s, lo, hi));
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !stateRef.current.disabled,
        onMoveShouldSetPanResponder: () => !stateRef.current.disabled,
        onPanResponderGrant: (e) => emitFromX(e.nativeEvent.locationX),
        onPanResponderMove: (e) => emitFromX(e.nativeEvent.locationX),
      }),
    [],
  );

  const ratio = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
  const usableWidth = Math.max(0, trackWidth - THUMB_SIZE);

  const onLayout = (e: LayoutChangeEvent): void => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setTrackWidth(w);
  };

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (disabled) return;
        if (event.nativeEvent.actionName === 'increment') {
          onValueChange(clamp(value + step, min, max));
        } else if (event.nativeEvent.actionName === 'decrement') {
          onValueChange(clamp(value - step, min, max));
        }
      }}
      style={[
        {
          height: THUMB_SIZE,
          justifyContent: 'center',
          opacity: disabled ? theme.opacity.disabled : 1,
        },
        style,
      ]}
      {...responder.panHandlers}
    >
      {/* Rail */}
      <View
        style={{
          height: TRACK_HEIGHT,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceSunken,
          overflow: 'hidden',
        }}
      >
        {/* Remplissage */}
        <View
          style={{
            width: ratio * trackWidth,
            height: '100%',
            borderRadius: radius.pill,
            backgroundColor: colors.accent,
          }}
        />
      </View>
      {/* Poignée */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: ratio * usableWidth,
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          borderWidth: theme.borderWidth.thick,
          borderColor: colors.accent,
          ...theme.elevation.sm,
        }}
      />
    </View>
  );
}
