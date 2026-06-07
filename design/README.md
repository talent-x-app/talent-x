# Talent-X — Design System

Système de design complet pour **Talent-X**, application mobile (iOS/Android, **React Native + Expo**, usage web prévu) qui relie **coachs sportifs** et **athlètes** : séances d'entraînement, suivi des performances, progression, collaboration.

> **Discipline principale : l'athlétisme (track & field).** Le produit est pensé d'abord pour les athlètes d'athlétisme et leurs coachs — sprint, demi-fond/fond, haies, sauts (longueur, hauteur, perche, triple), lancers (poids, disque, javelot, marteau). Le vocabulaire, les unités et les écrans privilégient cet univers (chronos, marques/PR, séries × répétitions, allures, fractionné, vent, couloirs).

- **Audience** : coachs d'athlétisme (club / indépendants), athlètes amateurs à confirmés.
- **Positionnement** : startup tech sérieuse à la frontière du sport et de la HealthTech. Données sensibles, rigueur RGPD/UE.
- **Ton** : confiant, dynamique, précis, motivant ; premium mais accessible et humain. *Pas* « salle de muscu agressive », *pas* clinique-froid, *pas* enfantin.
- **Direction** : **dark-first** (l'identité est pensée sur fond sombre), avec un thème clair complet et de qualité égale. Style **plat et net** — aucun biseau, brillance, ombre lourde ou dégradé décoratif. Le bleu est un accent énergique, pas une couleur de remplissage.

## Sources fournies
Le système est bâti **autour d'une identité déjà validée** (le logo n'est pas redessiné) :
- `uploads/talent-x-logo.html` — planche d'identité officielle (wordmark, monogramme, icône d'app, favicons, palette de base). Vectorisée, extraite dans `assets/`.
- `uploads/icon-512.png` — icône d'application 512×512 (tuile bleue + monogramme blanc).
- `uploads/apercu-monogramme-variantes.png` — variantes du monogramme « TX ».
- Polices **Poppins** (SIL OFL) fournies par l'utilisateur, auto-hébergées dans `fonts/`.

> Aucun codebase ni fichier Figma n'a été fourni : l'UI kit recrée l'application attendue à partir de l'identité, du brief produit et des conventions mobiles iOS/Android. À mettre à jour si le code source ou les maquettes Figma deviennent disponibles.

---

## CONTENT FUNDAMENTALS — écriture & ton

La copie est **française**, à la **2ᵉ personne du singulier** (« ton athlète », « crée le premier plan ») — proximité de coach, jamais condescendante. Registre **motivant mais factuel** : on parle chiffres, charge, progression, récupération.

- **Casse** : titres et libellés en *sentence case* (« Séance du jour », pas « Séance Du Jour »). Les overlines/eyebrows sont en MAJUSCULES espacées (`letter-spacing .22em`).
- **Vocabulaire métier** assumé, orienté **athlétisme** : *séance, fractionné, allure, chrono/temps, marque, PR/RP (record perso/personnel), série × répétition, récup, RPE, volume, vent (±m/s), couloir, départ/starting-block, épreuve (60 m, 100 m, 400 m, 110 m haies, longueur, perche, poids, javelot…)*. On suppose un utilisateur qui connaît la discipline.
- **Unités athlé** : chronos en `12.84 s` / `1:52.30` / `3 h 41 min` ; distances de lancer/saut en `m` (`6.42 m`, `58.10 m`) ; allures en `min/km` ; vent signé `+1.8 m/s` / `−0.4 m/s` (légal ≤ +2.0 m/s à signaler). Pas d'unités de musculation par défaut (la « charge » désigne la charge d'entraînement, pas un poids soulevé).
- **Concision** : phrases courtes, orientées action. Boutons à l'**impératif** (« Démarrer », « Nouveau plan », « Enregistrer »).
- **Chiffres** : unités collées et atténuées (`12.4 t`, `5 h 20`, `RPE 7`). Les deltas sont signés et colorés (`▲ 8 %` succès, `▼ 3 %` danger) — jamais la couleur seule (voir accessibilité).
- **Ton des messages système** : rassurant et précis. Succès = confirmation + conséquence (« Séance enregistrée. Athlète notifié. »). Alerte = constat + recommandation (« Charge élevée 3 jours d'affilée — prévoir une récup. »).
- **Émoji** : **aucun**. Les pictogrammes sont des icônes vectorielles, jamais des émoji.

---

## VISUAL FOUNDATIONS — motifs & fondations visuelles

**Palette.** Un seul accent : le **bleu** (`#2E7CF6`, le « X »), décliné en rampe 50→900. Neutres = rampe **slate** froide, de `#FFFFFF` à l'**ink** `#0B0F17`. Statuts success/warning/danger/info, chacun en 3 tons. Le **dégradé « X »** (`135°, #5BAEFF→#2E7CF6→#1B5BE0`) est **réservé à la signature** (marque, tuile d'icône, un seul accent héros) — jamais en remplissage d'UI ni sur du texte courant.

**Typographie.** **Poppins** partout (titres + UI), poids 400/500/600/700, pour cohérence avec le wordmark. Échelle modulaire display→overline. Titres en interlettrage négatif léger (`-0.02em`), overlines très espacés. Aucune police système de substitution.

**Espacement.** Grille **base 4px** (4, 8, 12, 16, 20, 24, 32, 40, 48, 64…). Densité mobile confortable, cibles tactiles **≥ 44px**.

**Arrondis.** Modérés : `xs 6` → `xl 28`, `pill` (full). La **tuile d'icône d'app** utilise un coin squircle ~22.5%. Les cartes d'UI restent plus sobres (`md 14` / `lg 20`).

**Fonds.** Aplats unis — `background` puis `surface` (légèrement plus clair en dark, blanc en light). **Pas** d'images full-bleed, de textures, de motifs répétés ni de dégradés décoratifs. Un seul halo radial bleu très discret est toléré en arrière-plan de héros (hérité de la planche d'identité).

**Élévation.** Différenciée par thème :
- **Clair** → ombres douces portées (`sm/md/lg`, opacité 8→14 %).
- **Sombre** → **pas d'ombres lourdes** : on sépare par **bordures fines** (`rgba(255,255,255,.08)`) et, pour un élément focalisé/feature, un **halo bleu** discret (`glow`).

**Bordures.** Hairline 1px omniprésente comme séparateur (surtout en dark). Trait focus 2px. La transparence sert aux bordures et aux fonds de statut (tints `rgba(...,.14)` en dark).

**Animation.** Durées `fast 120 / base 220 / slow 360`. Courbes : `standard`, `decelerate` (entrées), `accelerate` (sorties), et un **ressort** `cubic-bezier(.34,1.56,.64,1)` pour les affordances de pression (switch, pop). Mouvements sobres, jamais de boucle décorative infinie. `prefers-reduced-motion` neutralise les durées.

**États interactifs.**
- *Hover* : assombrissement de l'accent (light→`blue-600`) ou éclaircissement (dark→`blue-400`) ; voile `accent-subtle` sur les ghost ; `surface-sunken` sur les secondaires.
- *Press* : `transform: scale(0.97)` + `accent-pressed`.
- *Focus* : anneau 2px `focus-ring` avec `outline-offset: 2px`, toujours visible.
- *Disabled* : opacité 0.4, pointer-events none.

**Imagerie.** Photos sportives plutôt **froides / contrastées**, jamais chaudes-orangées ni grain rétro ; cadrage dynamique. (Aucune image fournie — utiliser des emplacements `image-slot` ou demander les visuels réels.)

**Cartes.** `surface`, bordure hairline, rayon `md`, ombre `sm` en light / bord seul en dark. Contenu aéré (padding 16–24). Pas de carte « rounded + bordure colorée à gauche ».

---

## ICONOGRAPHY

L'app n'a **pas** fourni de set d'icônes propriétaire. Le système adopte des **icônes au trait (outline)**, géométriques, **stroke 2.2px**, bouts et jointures arrondis — registre cohérent avec le tracé net et anguleux du logo.

- **Recommandation / substitution signalée** : utiliser **[Lucide](https://lucide.dev)** (MIT, CDN disponible) comme bibliothèque d'icônes. C'est le meilleur match au style (trait régulier, géométrie nette). Les cartes de preview et l'UI kit intègrent des tracés au style Lucide en SVG inline. **À valider / remplacer** si Talent-X possède un set maison.
- **Format** : SVG inline (`stroke="currentColor"`) pour hériter de la couleur de texte/tokens. Tailles `xs 16 / sm 20 / md 24 / lg 32`.
- **Tuiles d'icône** : seules les tuiles (ex. carte de séance) portent le **dégradé bleu** + glyphe blanc — c'est là que le bleu signature apparaît, conformément à l'identité.
- **Émoji** : jamais. **Caractères Unicode** comme icônes : uniquement les flèches de delta (`▲ ▼`) dans les chiffres, doublées d'une couleur ET d'un signe (indépendance à la couleur).
- **Marques** dans `assets/` : `logo-wordmark-dark.svg`, `logo-wordmark-light.svg`, `monogram-white.svg`, `monogram-ink.svg`, `app-icon.svg`, `app-icon-512.png`, `monogram-variants.png`.

---

## ACCESSIBILITÉ (WCAG AA)

Ratios vérifiés (voir aussi `$description` dans `tokens.json`) :

| Combinaison | Ratio | Verdict |
|---|---|---|
| `text-primary` `#0B0F17` / surface blanche | ~19:1 | AAA |
| `text-secondary` `#3C4456` / blanc | ~9:1 | AAA |
| `text-muted` `#5C6678` / blanc | ~5.2:1 | AA |
| `text-primary` `#E7ECF3` / ink | ~15:1 | AAA |
| `text-secondary` `#8A94A6` / ink | ~6.4:1 | AA |
| `accent-text` `#1747B0` / blanc | ~6.4:1 | AA |
| `accent-text` `#5BAEFF` / ink | ~7:1 | AAA |
| Blanc / `accent` `#2E7CF6` (bouton) | ~3.7:1 | AA *texte large/gras ≥14px gras* |

- Cibles tactiles **≥ 44px** ; focus visible partout ; **Dynamic Type** supporté (échelle en `px` mappable en `sp`/points, interlignes relatifs).
- **Indépendance à la couleur** : statuts toujours accompagnés d'une icône, d'un libellé ou d'un signe (deltas `▲/▼`).
- `text-muted` est réservé au texte non essentiel (métadonnées) ; ne jamais l'utiliser pour de l'information critique.

---

## Index du dossier

**Fondations (code, source de vérité)**
- `tokens.json` — tokens W3C Design Tokens. **Tout dérive d'ici.**
- `tokens.css` — variables CSS `:root` (light) + `[data-theme="dark"]`, avec `@font-face` Poppins auto-hébergé + fallback CDN.
- `colors_and_type.css` — classes utilitaires prêtes à l'emploi (`.tx-h1`, `.tx-body`, `.tx-fg-*`, `.tx-bg-*`…).
- `theme/talentx-theme.ts` — thème **React Native / Expo** typé : `palette`, `lightTheme`, `darkTheme`, `gradientX`, `useTheme()`, `useSystemTheme()`.
- `fonts/` — Poppins (TTF, tous poids + italiques), SIL OFL.

**Rendus**
- `kitchen-sink.html` — écran vitrine : fondations + composants, bascule clair/sombre.
- `preview/` — cartes du Design System (couleurs, type, espacement, composants, marque). `_card.css` / `_components.css` = styles partagés, pilotés par tokens.

**Marque**
- `assets/` — logos, monogrammes, icône d'app (SVG + PNG), planche de variantes.

**UI kit**
- `ui_kits/talent-x-app/` — recréation haute-fidélité de l'app mobile (écrans cliquables + composants JSX). Voir son `README.md`.

**Divers**
- `SKILL.md` — métadonnées Agent Skill (réutilisation dans Claude Code).
