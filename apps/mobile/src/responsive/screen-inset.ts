import { useTheme } from '@talent-x/design-tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';

/**
 * Style de scène des navigateurs : réserve la **zone sûre haute** (barre d'état, encoche).
 *
 * Les quatre navigateurs de l'app sont en `headerShown: false` (racine, auth, tabs athlète,
 * tabs coach). Sans en-tête, rien ne pousse le contenu sous la barre d'état — et l'edge-to-edge
 * d'Android fait le reste : le premier élément de chaque écran passait **sous** la barre d'état
 * sur les deux plateformes. Le bas ne posait pas de problème, la tab bar appliquant déjà son
 * propre inset.
 *
 * Posé **une fois par navigateur** (`sceneStyle` / `contentStyle`) et non dans chaque écran :
 * les écrans sont des enfants directs de ces navigateurs, et un `paddingTop` répété serait
 * autant d'occasions de l'oublier au prochain écran ajouté.
 *
 * `backgroundColor` accompagne obligatoirement le padding : sans lui, la bande réservée
 * laisserait voir le fond par défaut du navigateur — clair, donc très visible en thème sombre.
 *
 * Aucune valeur en dur : la hauteur vient des insets de l'appareil, la couleur du thème.
 */
export function useScreenSceneStyle(): ViewStyle {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return { paddingTop: insets.top, backgroundColor: colors.background };
}
