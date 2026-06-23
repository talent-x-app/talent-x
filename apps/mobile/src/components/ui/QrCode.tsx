import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';

export interface QrCodeProps {
  /** Donnée encodée (ici : le code d'invitation du groupe). */
  value: string;
  /** Côté visé en px (le rendu est arrondi au multiple de module le plus proche). */
  size?: number;
  testID?: string;
}

/**
 * QR code rendu **sans dépendance native** : la matrice est calculée en pur JS
 * (`qrcode-generator`) et peinte en grille de `View` (compatible web + natif).
 * Le contraste **noir sur blanc** et la **zone de silence** sont imposés par la
 * lisibilité machine (élément type code-barres) — exception assumée au thème,
 * couleurs tout de même tirées de la palette du design system.
 */
export function QrCode({ value, size = 168, testID }: QrCodeProps) {
  const { palette, radius } = useTheme();
  const { count, cell, dim, matrix } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const moduleCount = qr.getModuleCount();
    const quiet = 2; // zone de silence (en modules) requise autour du QR
    const cellSize = Math.max(1, Math.floor(size / (moduleCount + quiet * 2)));
    const rows = Array.from({ length: moduleCount }, (_, r) =>
      Array.from({ length: moduleCount }, (_, c) => qr.isDark(r, c)),
    );
    return {
      count: moduleCount,
      cell: cellSize,
      dim: cellSize * (moduleCount + quiet * 2),
      matrix: rows,
    };
  }, [value, size]);

  const dark = palette.slate[950];
  const light = palette.white;

  return (
    <View
      testID={testID}
      accessibilityLabel="QR code du code d'invitation"
      style={{
        width: dim,
        height: dim,
        backgroundColor: light,
        borderRadius: radius.sm,
        // padding = zone de silence (dim - count*cell) / 2.
        padding: (dim - count * cell) / 2,
        alignSelf: 'center',
      }}
    >
      {matrix.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((isDark, c) => (
            <View
              key={c}
              style={{ width: cell, height: cell, backgroundColor: isDark ? dark : light }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
