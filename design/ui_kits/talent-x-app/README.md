# Talent‑X — UI kit (app mobile)

Recréation haute‑fidélité de l'application **Talent‑X** (coach ↔ athlète), **dark‑first**, copie française. Prototype cliquable construit entièrement sur les tokens du design system (`../../tokens.css`).

> Aucun codebase ni Figma n'a été fourni. Les écrans recréent l'app **attendue** à partir de l'identité de marque, du brief produit et des conventions mobiles. À recaler si le code source ou les maquettes deviennent disponibles.

## Lancer
Ouvre `index.html`. Le prototype démarre sur l'écran de connexion :
**Se connecter → Accueil → ouvre un athlète → lance une séance**. La barre d'onglets (Accueil / Calendrier / Progression / Profil) est active.

## Fichiers
- `theme.jsx` — `window.TX` (tokens runtime, dark + light), `theme(mode)`, et `Icon` (set d'icônes au trait, style Lucide). Source de vérité visuelle = `../../tokens.json`.
- `components.jsx` — composants réutilisables : `TXButton`, `TXAppBar`, `TXTabBar`, `TXAvatar`, `TXBadge`, `TXCard`, `TXMetric`, `TXRing`, `TXBar`, `TXField`, `TXSegmented`, `TXChip`, `TXSwitch`.
- `ios-frame.jsx` — bezel iOS 26 (scaffold omelette : status bar, dynamic island, home indicator, clavier). Utilisé uniquement comme cadre ; le contenu est 100 % Talent‑X.
- `screens.jsx` — `LoginScreen`, `HomeScreen` (dashboard coach), `AthleteScreen` (détail + progression).
- `screens2.jsx` — `WorkoutScreen` (séance), `CalendarScreen`, `ProgressScreen`, `ProfileScreen`.
- `index.html` — harnais React + Babel ; gère l'auth, les onglets et la pile de navigation (push/pop).

## Conventions
- Tous les composants reçoivent un objet thème `t` (`theme('dark')` par défaut). Les visuels dérivent des tokens — pas de couleurs en dur hors gradient signature.
- Le **dégradé X** n'apparaît que sur les tuiles d'icône, l'avatar coach et la tuile de marque (login) — jamais en fond d'UI ni sur du texte.
- Cibles tactiles ≥ 44px, états press `scale(0.97)`, focus visible.
- Composants partagés entre fichiers Babel via `Object.assign(window, …)` en fin de fichier.

## Couverture
Connexion · dashboard coach (séance du jour, métriques, roster) · détail athlète (segmented, ring, barres, mini‑chart, séances) · séance avec checklist d'exercices et action fixe · planning hebdo · vue progression (line chart + alerte charge) · profil/réglages (switches, listes). Bonne couverture des composants ; tous les écrans ne sont pas exhaustifs.
