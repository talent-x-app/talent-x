# @talent-x/design-tokens

Design system Talent-X **en code** : tokens typés, thème React Native (light/dark, **dark-first**) et variables CSS pour le web.

Source de vérité : [`src/tokens.json`](src/tokens.json) (format W3C Design Tokens). Le portage RN ([`src/tokens.ts`](src/tokens.ts)) en est dérivé fidèlement ; un test de parité ([`src/tokens.test.ts`](src/tokens.test.ts)) garantit l'absence de dérive.

## React Native / Expo

```tsx
import { ThemeProvider, useTheme } from '@talent-x/design-tokens';

// 1. Envelopper l'app (sans prop = suit l'OS, dark-first)
<ThemeProvider>
  <App />
</ThemeProvider>;

// 2. Lire le thème dans un composant — JAMAIS de valeur en dur
function Card() {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, padding: spacing[4], borderRadius: radius.md }}>
      <Text style={{ color: colors.textPrimary, fontFamily: typography.fontFamily.semibold }}>
        Bonjour
      </Text>
    </View>
  );
}
```

Exports utiles : `palette`, `gradientX`, `lightTheme`/`darkTheme`, `typography`, `spacing`, `radius`, `borderWidth`, `iconSize`, `touchTarget`, `motion`, `elevation`, `opacity`, `useTheme`, `useSystemTheme`, `ThemeProvider`, `ThemeContext`, type `Theme`, `contrastRatio`/`meetsAA`/`WCAG`.

> Polices : le thème nomme `Poppins_400Regular` … `Poppins_700Bold` (exports de `@expo-google-fonts/poppins`). L'app doit charger ces polices (cf. `apps/mobile/app/_layout.tsx`).
>
> Le **gradient X** (`gradientX`) est réservé à la marque / un unique accent héros — jamais en fond d'UI ni sur du texte courant.

### Couleurs de texte & accessibilité (`textSecondary` vs `textMuted`)

Pour rester **WCAG 2.1 AA**, le choix entre les deux tokens de texte secondaire dépend de la
**fonction** du texte, pas de son apparence (TLX-145) :

| Token           | Contraste sur fond sombre | Usage                                                                            |
| --------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `textSecondary` | ≈ 6.3:1 — **AA normal**   | Tout texte **porteur d'information** < 18px : sous-titres, métadonnées, détails. |
| `textMuted`     | ≈ 3.3:1 — **AA large**    | Décoratif / non essentiel **uniquement**, ou texte ≥ 18px (placeholders, hints). |

> ⚠️ Ne jamais utiliser `textMuted` pour du texte normal (< 18px) qui véhicule du sens sur fond
> sombre : il est sous le seuil 4.5:1. Le thème **clair** est, lui, conforme pour les deux.

L'utilitaire [`contrastRatio`](src/contrast.ts) (export public) et son test
([`src/contrast.test.ts`](src/contrast.test.ts)) verrouillent cette règle : ils échouent si un
token de texte repasse sous le seuil AA attendu.

## Web (react-native-web / autres cibles)

```ts
import '@talent-x/design-tokens/css'; // tokens.css + colors_and_type.css
```

Variables `--tx-*` sur `:root` (light) et `[data-theme="dark"]` (dark), plus les classes utilitaires `.tx-h1`, `.tx-body`, `.tx-fg-*`, `.tx-bg-*`.

## Scripts

| Commande                                          | Effet                               |
| ------------------------------------------------- | ----------------------------------- |
| `pnpm --filter @talent-x/design-tokens build`     | Compile `src` → `dist` (JS + types) |
| `pnpm --filter @talent-x/design-tokens typecheck` | Vérifie les types                   |
| `pnpm --filter @talent-x/design-tokens test`      | Test de parité avec `tokens.json`   |
