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

Exports utiles : `palette`, `gradientX`, `lightTheme`/`darkTheme`, `typography`, `spacing`, `radius`, `borderWidth`, `iconSize`, `touchTarget`, `motion`, `elevation`, `opacity`, `useTheme`, `useSystemTheme`, `ThemeProvider`, `ThemeContext`, type `Theme`.

> Polices : le thème nomme `Poppins_400Regular` … `Poppins_700Bold` (exports de `@expo-google-fonts/poppins`). L'app doit charger ces polices (cf. `apps/mobile/app/_layout.tsx`).
>
> Le **gradient X** (`gradientX`) est réservé à la marque / un unique accent héros — jamais en fond d'UI ni sur du texte courant.

## Web (react-native-web / autres cibles)

```ts
import '@talent-x/design-tokens/css'; // tokens.css + colors_and_type.css
```

Variables `--tx-*` sur `:root` (light) et `[data-theme="dark"]` (dark), plus les classes utilitaires `.tx-h1`, `.tx-body`, `.tx-fg-*`, `.tx-bg-*`.

## Scripts

| Commande | Effet |
|---|---|
| `pnpm --filter @talent-x/design-tokens build` | Compile `src` → `dist` (JS + types) |
| `pnpm --filter @talent-x/design-tokens typecheck` | Vérifie les types |
| `pnpm --filter @talent-x/design-tokens test` | Test de parité avec `tokens.json` |
