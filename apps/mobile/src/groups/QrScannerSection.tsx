import { useTheme } from '@talent-x/design-tokens';
import { useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import { Button } from '../components/ui';

/**
 * Scanner de QR d'invitation (TLX-188) — natif uniquement.
 *
 * `expo-camera` est chargé paresseusement (`require` au rendu, jamais au chargement
 * du module) : sur web le module natif n'existe pas et un import top-level casserait
 * le bundle react-native-web ; sur un dev client trop ancien (drift TLX-141), le
 * `require` échoue proprement → la section disparaît, la saisie manuelle reste.
 */

type PermissionState = { granted: boolean; canAskAgain?: boolean } | null;

type CameraModule = {
  CameraView: React.ComponentType<{
    style?: object;
    facing?: string;
    barcodeScannerSettings?: { barcodeTypes: string[] };
    onBarcodeScanned?: (event: { data: string }) => void;
    testID?: string;
  }>;
  useCameraPermissions: () => [PermissionState, () => Promise<unknown>];
};

function cameraModule(): CameraModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-camera') as CameraModule;
  } catch {
    return null;
  }
}

/** Le scan est-il disponible sur cette plateforme/ce build ? */
export function qrScanAvailable(): boolean {
  return cameraModule() != null;
}

export interface QrScannerSectionProps {
  /** Appelé une seule fois avec le payload brut du premier QR lu. */
  onScanned: (payload: string) => void;
}

/** Section caméra : demande de permission puis `CameraView` en lecture de QR. */
export function QrScannerSection({ onScanned }: QrScannerSectionProps) {
  const camera = cameraModule();
  if (camera == null) return null;
  return <Scanner camera={camera} onScanned={onScanned} />;
}

function Scanner({ camera, onScanned }: QrScannerSectionProps & { camera: CameraModule }) {
  const { colors, typography, spacing, radius } = useTheme();
  const [permission, requestPermission] = camera.useCameraPermissions();
  // Un CameraView émet l'événement en rafale : on ne remonte que le premier QR lu.
  const scannedRef = useRef(false);

  if (!permission?.granted) {
    return (
      <View style={{ gap: spacing[3], alignItems: 'flex-start' }} testID="join-group-qr-permission">
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {permission?.canAskAgain === false
            ? 'Accès caméra refusé. Autorise la caméra dans les réglages du téléphone pour scanner le QR.'
            : 'Talent-X a besoin de la caméra pour scanner le QR affiché par ton coach.'}
        </Text>
        {permission?.canAskAgain === false ? null : (
          <Button
            testID="join-group-qr-allow"
            variant="secondary"
            onPress={() => void requestPermission()}
          >
            Autoriser la caméra
          </Button>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: spacing[2] }}>
      <camera.CameraView
        testID="join-group-qr-camera"
        style={{ height: 260, borderRadius: radius.lg, overflow: 'hidden' }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (scannedRef.current) return;
          scannedRef.current = true;
          onScanned(data);
        }}
      />
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
          textAlign: 'center',
        }}
      >
        Vise le QR affiché par ton coach.
      </Text>
    </View>
  );
}
