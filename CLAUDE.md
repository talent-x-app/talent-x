# Talent-X — Guide pour Claude Code

## Le projet
App mobile (iOS/Android) d'athlétisme reliant **coachs** et **athlètes** :
séances d'entraînement, saisie de performances, progression, feedback, groupes.
Mono-repo : `apps/mobile` (Expo / React Native) + `apps/api` (NestJS) + `packages/*` partagés.

## Stack
- Frontend : React Native / Expo, expo-router, TanStack Query — TypeScript strict
- Backend  : NestJS + Prisma + PostgreSQL + Redis (OVHcloud, UE)
- Auth     : JWT RS256, refresh rotatif, RBAC + ownership + consentement
- API      : REST `/api/v1` — contrat dans `docs/talent-x-openapi.yaml` (source de vérité)

## Conventions
- Commits : Conventional Commits + ID de ticket — `feat(TLX-052): ...`
- Branches : `feature/TLX-052-...`
- Tests obligatoires sur tout endpoint backend ; rendu + interactions clés côté front
- Jamais de valeur en dur : config via `.env`, styles via les tokens du design system

## Où trouver quoi (À CONSULTER AVANT DE CODER)
- Spécifications techniques : `docs/Talent-X_01_Architecture_v2.md`, `docs/Talent-X_03_Securite_RGPD_v2.md`,
  `docs/Talent-X_06_Modele_de_donnees.md`, `docs/Talent-X_04_Deploiement_exploitation_v2.md`,
  `docs/Talent-X_02_Specifications_fonctionnelles_et_API_v2.md`, `docs/Talent-X_07_DPIA_AIPD.md`
- Contrat API (source de vérité) : `docs/talent-x-openapi.yaml`
- Décisions d'architecture : `docs/Talent-X_Journal_ADR.md`
- Backlog & tickets : `Talent-X_structure-tickets_v2.md`
- Design system & tokens : `design/styles.css`, `design/colors_and_type.css`, `design/tokens.json`, `design/tokens.css`, `design/kitchen-sink.html`
- **Écrans / UI kit** : `design/ui_kits/talent-x-app/screens.jsx`, `screens2.jsx`, `components.jsx`, `theme.jsx`
- Aperçus de composants (référence visuelle) : `design/preview/*.html`

## Règles de travail
1. Lire `CURRENT_SPRINT.md` au démarrage de chaque session.
2. Avant d'implémenter un **écran**, lire le code correspondant dans `design/ui_kits/talent-x-app/` et réutiliser le design system.
3. Avant un **endpoint**, lire `docs/talent-x-openapi.yaml` + la règle métier concernée dans `docs/`.
4. Travailler dans l'ordre des **dépendances** des tickets (Fondations → Auth/RGPD → reste).
5. Ne PAS modifier `docs/` ni `design/` sauf demande explicite : ce sont les spécifications.
6. Specs lues par toi = texte (md/yaml/json). Les `.docx` (`docs/originals/`) et `.png` sont pour les humains.
