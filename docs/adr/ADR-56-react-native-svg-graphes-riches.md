# ADR-56 — Adopter react-native-svg pour les graphes riches (progression)

- **Statut :** Accepté (2026-06-28, validé)
- **Date :** 2026-06-28
- **Amende / complète :** **TLX-212 / R9** (ADR informelle « courbe de progression sans dépendance,
  rendue en `View` »). Concerne la progression partagée athlète A-06 (`ProgressScreen`) + coach
  C-03 (`AthleteDetailScreen`), composants `progress-charts.tsx`.
- **Réf. :** demande produit (2026-06-28) — « le graphe ne se lit pas, trouve un truc moderne et
  une très bonne UX, pour toutes les disciplines ». CLAUDE.md règle 7 (choix structurant /
  dépendance native → ADR avant code).
- **Tickets liés :** refonte graphe (ce périmètre) ; **rebuild dev-client** (TLX-141-bis, ci-dessous).

## Contexte

Le sparkline `View` livré en R9 (TLX-212) corrige le contresens chrono et modernise l'allure, mais
**ne se lit pas** : seule la meilleure/dernière marque est chiffrée — ni valeur par point, ni
amplitude, ni delta. La demande produit est une **expérience riche et lisible** : courbe lissée,
aire, **tooltip par point**, repères (PB/échelle), **bandeau de marques**, **delta de progression**,
le tout **pour toutes les disciplines** (temps `s`/`mm:ss` sens min ; distance `m` sens max).

En R9, on avait écarté SVG pour éviter un **module natif** (risque device, cf. TLX-141 où
`ExponentImagePicker` manquant crashait le dev-client). À l'usage, l'objectif « courbe lissée + aire
dégradée + tooltip net » justifie de **rouvrir** ce choix : ces rendus sont natifs à SVG et
laborieux/fragiles en `View` (segments tournés, pas de remplissage dégradé, pas de courbe).

## Décision

### D1 — Adopter `react-native-svg` pour les graphes riches

Ajout de `react-native-svg` (via `expo install`, version alignée sur le SDK Expo). Premier usage :
le composant **`ProgressChart`** (aire dégradée + **courbe lissée bézier monotone** + points + ligne
**PB** + tooltip). Réutilisable pour d'autres graphes futurs.

### D2 — Web immédiat, device après rebuild (TLX-141-bis)

- **Web** (cible de vérif Expo web / Playwright) : fonctionne dès l'install (`react-native-svg`
  supporte react-native-web).
- **Natif** (dev-client Samsung S20 FE) : le module natif **absent de l'APK installé** ⇒ crash tant
  que le dev-client n'est pas **rebuildé**. On crée un ticket **TLX-141-bis** « rebuild dev-client
  (react-native-svg) », même famille que TLX-141. Le code reste mergé (web vérifié) ; le device
  attend le rebuild — assumé.

### D3 — Le graphe reste **données-pures + présentationnel**

- Les **dérivations** (points orientés performance, meilleur index, **delta net de fenêtre**, **delta
  point↔précédent**) vivent dans des helpers **purs et testés** (`progress-series.ts`) — pas de SVG,
  pas de requête. `ProgressChart` ne fait que **rendre** un modèle déjà calculé.
- **Unité/sens-aware** via `formatRecordValue` (`s`/`m`, `mm:ss`) + `direction` (`min`/`max`) ⇒
  **zéro cas particulier par discipline** (sprint, haies, demi-fond, sauts, perche, lancers).

### D4 — Expérience (lisibilité par divulgation progressive)

1. **Bandeau progression** : delta net sur la fenêtre, coloré par le **sens** (vert = amélioration —
   chrono qui baisse *ou* distance qui monte).
2. **Courbe** lissée + aire ; **point sélectionnable** (tap natif / hover web ; défaut = dernier) →
   ligne-guide + **tooltip** `date · valeur · Δ vs préc.` ; **ligne PB** + repères meilleure/pire.
3. **Bandeau de marques** scrollable (puce `date · valeur · ▲/▼`, tap-synchronisé) — le **journal
   lisible** : on lit *toutes* les marques sans surcharger la courbe.
4. **Adaptatif** : 1 marque → grand chiffre ; 2 → « avant → après » ; 3+ → courbe.

### D5 — Invariants

Zéro backend, zéro contrat (le DTO `Progress`/`ProgressSeries` suffit). Le **cloisonnement coach**
(ADR-51/36 — le coach ne voit que les marques de ses séances) est **inchangé** : c'est une décision
produit séparée, hors de ce rendu.

## Conséquences

- **+** Progression enfin **lisible** (chaque marque), moderne, cohérente toutes disciplines ;
  brique `react-native-svg` réutilisable.
- **+** Logique testable isolée (helpers purs) ; SVG = pur rendu.
- **−** **Dépendance native** : impose un **rebuild dev-client** pour le device (TLX-141-bis) ; web OK.
- **−** Surface : nouveau composant + helpers + tests ; `react-native-svg` dans le bundle.
- **−** Tests Jest : `react-native-svg` doit être rendu/mocké sous jest-expo (préset compatible, mock
  si besoin).

## Alternatives écartées

- **Rester en `View` (statu quo R9).** Rejeté : courbe lissée + aire + tooltip net y sont
  laborieux/fragiles ; l'UX visée n'est pas atteinte.
- **Lib de charts clé en main** (victory-native, gifted-charts…). Rejeté : plus lourd, moins
  contrôlable sur le sens/format par discipline et le style design-system, et tire **aussi**
  `react-native-svg` — autant le maîtriser directement.
- **Image/canvas serveur.** Rejeté : hors-ligne, latence, pas d'interaction.

## Plan

1. ADR-56 (ceci) + `expo install react-native-svg` + ticket **TLX-141-bis** (rebuild dev-client).
2. Helpers purs (`windowDelta`, modèle de courbe) — `progress-series.ts` + tests.
3. `ProgressChart` SVG (aire + bézier + points + PB + tooltip + interaction).
4. `ProgressSeriesCard` : bandeau progression + `ProgressChart` + bandeau de marques + adaptatif.
5. Tests Jest + typecheck + vérif web ; device différé (TLX-141-bis).
