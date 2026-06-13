import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useContentMaxWidth } from './breakpoints';

/**
 * Conteneur de contenu **centré et borné en largeur** (TLX-123). À placer comme enfant unique
 * d'un `ScrollView` (le `gap`/l'espacement vertical passe sur `style`). Sur téléphone : pleine
 * largeur (no-op). Sur tablette/desktop : largeur plafonnée + centrée via `alignSelf`. C'est un
 * enfant flex normal du conteneur de contenu → le centrage est fiable cross-plateforme.
 */
export function ResponsiveContent({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const maxWidth = useContentMaxWidth();
  return (
    <View testID={testID} style={[{ width: '100%', maxWidth, alignSelf: 'center' }, style]}>
      {children}
    </View>
  );
}
