# Talent-X — Guide pour Claude Code

## Le projet
App mobile (iOS/Android) d'athlétisme reliant **coachs** et **athlètes** :
séances d'entraînement, saisie de performances, progression, feedback, groupes.
Mono-repo : `apps/mobile` (Expo / React Native) + `apps/api` (NestJS) + `packages/*` partagés.

## Stack
- Frontend : React Native / Expo, expo-router, TanStack Query — TypeScript strict
- Backend  : NestJS + Prisma + PostgreSQL + Redis (OVHcloud, UE)
- Auth     : JWT RS256, refresh rotatif, RBAC + ownership + consentement
- API      : REST `/api/v1` — contrat dans `docs/openapi.yaml` (source de vérité)

## Conventions
- Commits : Conventional Commits + ID de ticket — `feat(TLX-052): ...`
- Branches : `feature/TLX-052-...`
- Tests obligatoires sur tout endpoint backend ; rendu + interactions clés côté front
- Jamais de valeur en dur : config via `.env`, styles via les tokens du design system

## Où trouver quoi (À CONSULTER AVANT DE CODER)
- Spécifications techniques : `docs/architecture.md`, `docs/security-rgpd.md`,
  `docs/data-model.md`, `docs/operations.md`, `docs/api-rules.md`, `docs/dpia.md`
- Contrat API (source de vérité) : `docs/openapi.yaml`
- Décisions d'architecture : `docs/adr/`
- Backlog & tickets : `docs/backlog/`
- Design system & tokens : `design/design-system.html`, `design/tokens.json`, `design/tokens.css`
- **Cartes d'écran détaillées** : `design/screens/*.md`
  (carte-ecrans, saisie-perf, constructeur-seance, tableau-de-bord)
- Wireframes (référence visuelle) : `design/screens/wireframes/`
- Jeu de données d'exemple (mock + seed) : `design/sample-data.json`

## Règles de travail
1. Lire `CURRENT_SPRINT.md` au démarrage de chaque session.
2. Avant d'implémenter un **écran**, lire sa carte dans `design/screens/` et réutiliser le design system.
3. Avant un **endpoint**, lire `docs/openapi.yaml` + la règle métier concernée dans `docs/`.
4. Travailler dans l'ordre des **dépendances** des tickets (Fondations → Auth/RGPD → reste).
5. Ne PAS modifier `docs/` ni `design/` sauf demande explicite : ce sont les spécifications.
6. Specs lues par toi = texte (md/yaml/json). Les `.docx` (`docs/originals/`) et `.png` sont pour les humains.
