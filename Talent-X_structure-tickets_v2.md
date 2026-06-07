# Talent-X — Structure de ticketing v2 (Linear-ready)

Version améliorée et alignée sur Linear. Identifiant d'équipe : **TLX**.
Accompagnée de `Talent-X_linear-import.csv` (import direct) et d'un prompt Claude Code.

---

## 1. Ce qui change par rapport à la v1
- **Cartographie Linear native** : Équipe → Projet → **Jalons** (milestones) → **Cycles** (sprints), avec priorités, estimations et labels exploitables tels quels.
- **Dépendances explicites** entre tickets (`Dépend de`) → l'ordre de travail devient déterministe, ce qui évite à Claude Code de partir sur un ticket dont les prérequis n'existent pas.
- **Tickets de fondation ajoutés** (souvent oubliés) : génération du client API depuis l'OpenAPI, navigation expo-router, couche données TanStack Query, schéma Prisma + migration, gestion globale des erreurs, harnais de tests, observabilité.
- **Gros écrans découpés en sous-issues** (constructeur de séance, saisie de perf, tableau de bord) → des lots de 3–5 points qu'on peut fermer un par un.
- **Definition of Ready / Definition of Done** explicites + **objectif de démo par cycle** (chaque sprint livre quelque chose de montrable).
- **Estimations Fibonacci** et **priorités Linear** (Urgent/High/Medium/Low) sur chaque ticket.

## 2. Cartographie Linear
- **Équipe** : `Talent-X` (préfixe `TLX`).
- **Projet** : `Talent-X MVP`.
- **Jalons (milestones)** : Fondations · Auth & RGPD · Profils & Groupes · Sessions · Performances · Pilotage coach · Progression & Échanges · Calendrier & Compétitions · Lancement & Qualité.
- **Cycles (sprints)** : 2 semaines, voir §4.
- **Labels** : `frontend` · `backend` · `infra` · `design-system` · `api` · `test` · `rgpd` · `docs` · `bug` · `spike`.
- **Priorités** : Urgent · High · Medium · Low.
- **Estimation** : points Fibonacci (1, 2, 3, 5, 8, 13).
- **Sous-issues** : les tickets marqués `[PARENT]` (TLX-052, TLX-071, TLX-081) regroupent les tickets « éditeur de bloc » / « mode de saisie » / « section » qui suivent.

## 3. Definition of Ready / Definition of Done
**Prêt (DoR)** — un ticket entre dans un cycle quand : contexte + réf. doc présents · critères d'acceptation testables · dépendances satisfaites ou planifiées · estimation posée.
**Terminé (DoD)** — code + tests (backend : unitaire + intégration sur l'endpoint ; frontend : rendu + interactions clés) · critères cochés · PR liée au ticket et revue · aucun secret en dur · déployé en dev.

## 4. Cadence & objectifs de démo

| Cycle | Jalon(s) | Objectif démontrable en fin de cycle |
|-------|----------|--------------------------------------|
| S-00 | Fondations | L'app démarre avec le thème, la CI est verte, la base est seedée. |
| S-01 | Auth & RGPD | Je peux m'inscrire, choisir mon rôle, consentir, me connecter. |
| S-02 | Profils & Groupes | Le coach voit ses athlètes et groupes ; les profils sont éditables. |
| S-03 | Sessions | Le coach construit une séance multi-blocs et l'assigne. |
| S-04 | Performances | L'athlète enregistre une perf (4 modes) liée à une séance. |
| S-05 | Pilotage coach | Le coach voit son tableau de bord et revoit une perf avec feedback. |
| S-06 | Progression & Échanges | L'athlète voit sa progression, ses records, le feedback ; notifications. |
| S-07 | Calendrier & Compétitions | Calendrier et compétitions des deux côtés. |
| S-08 | Lancement & Qualité | Tests verts, RGPD complet, build EAS, déploiement prod. |

## 5. Backlog (78 tickets, groupés par jalon)

#### Fondations

| ID | Titre | Labels | Prio | Est. | Dépend de | Réf. |
|----|-------|--------|------|------|-----------|------|
| TLX-001 | Initialiser le mono-repo (Expo + NestJS + Prisma, pnpm workspaces) | infra·frontend·backend | Urgent | 5 | — | TX-OPS-004 |
| TLX-002 | Config qualité : ESLint, Prettier, TypeScript strict, Husky pre-commit | infra | High | 2 | TLX-001 | — |
| TLX-003 | Pipeline CI (lint, typecheck, tests, build) | infra·test | High | 3 | TLX-001 | TX-OPS-004 §6 |
| TLX-004 | Environnements dev/staging/prod + gestion des secrets | infra | High | 3 | TLX-001 | TX-OPS-004 §5 |
| TLX-005 | Design system en code : tokens RN + CSS + thème typé | design-system·frontend | Urgent | 5 | TLX-001 | Design system |
| TLX-006 | Bibliothèque de composants de base (bouton, champ, carte, chip, slider, tab bar) | design-system·frontend | High | 8 | TLX-005 | Design system |
| TLX-007 | Navigation expo-router + tab bars coach/athlète | frontend | High | 5 | TLX-006 | Carte écrans |
| TLX-008 | Générer le client API typé depuis l'OpenAPI (orval) | frontend·api | High | 3 | TLX-001 | talent-x-openapi.yaml |
| TLX-009 | Couche données : TanStack Query + intercepteur auth/refresh | frontend | High | 5 | TLX-008 | TX-ARCH-001 §8 |
| TLX-010 | Gestion globale erreurs / toasts / bandeau hors-ligne | frontend | Medium | 3 | TLX-006 | — |
| TLX-011 | Squelette NestJS + DTO/contrôleurs depuis l'OpenAPI | backend·api | Urgent | 5 | TLX-001 | talent-x-openapi.yaml |
| TLX-012 | Schéma Prisma depuis le modèle de données + migration initiale | backend | Urgent | 5 | TLX-001 | TX-DATA-006 |
| TLX-013 | Journalisation structurée + request-id + endpoint /health | backend·infra | Medium | 2 | TLX-011 | TX-OPS-004 |
| TLX-014 | Seed de la base de dev depuis talent-x-sample-data.json | backend | Medium | 2 | TLX-012 | Sample data |
| TLX-015 | Harnais de tests : Jest (unit) + Maestro (e2e mobile) + e2e API | infra·test | Medium | 5 | TLX-003 | TX-OPS-004 §6 |

#### Auth & RGPD

| ID | Titre | Labels | Prio | Est. | Dépend de | Réf. |
|----|-------|--------|------|------|-----------|------|
| TLX-020 | Génération et rotation des clés RS256 | backend·infra | Urgent | 3 | TLX-011 | TX-ARCH-001 ADR-04 |
| TLX-021 | POST /auth/register — inscription + choix du rôle | backend·api | Urgent | 5 | TLX-012, TLX-020 | OpenAPI |
| TLX-022 | POST /auth/login — JWT access + refresh | backend·api | Urgent | 5 | TLX-021 | OpenAPI |
| TLX-023 | POST /auth/refresh — rotation du refresh token | backend·api | Urgent | 3 | TLX-022 | OpenAPI |
| TLX-024 | Middleware RBAC + ownership (coach/athlète/groupe) | backend | Urgent | 5 | TLX-022 | TX-ARCH-001 §9 |
| TLX-025 | Écran Connexion (O-02) | frontend | High | 3 | TLX-007, TLX-009 | Carte O-02 |
| TLX-026 | Écrans Inscription + choix du rôle (O-03, O-04) | frontend | High | 5 | TLX-007, TLX-009 | Carte O-03/04 |
| TLX-027 | Persistance de session + refresh silencieux (app) | frontend | High | 3 | TLX-009, TLX-023 | — |
| TLX-030 | Écran Consentement (O-05, case non pré-cochée) | frontend·rgpd | Urgent | 3 | TLX-026 | Carte O-05 |
| TLX-031 | POST /consents + versionnage du consentement | backend·api·rgpd | Urgent | 3 | TLX-012 | TX-SEC-003 |
| TLX-032 | Gating API CONSENT_REQUIRED (données de santé) | backend·rgpd | Urgent | 5 | TLX-031, TLX-024 | TX-SEC-003 |
| TLX-033 | GET /users/:id/data-export — export RGPD | backend·api·rgpd | Medium | 5 | TLX-032 | TX-SEC-003 §6 |
| TLX-034 | DELETE /users/:id — effacement + anonymisation | backend·api·rgpd | Medium | 5 | TLX-032 | TX-SEC-003 §7 |

#### Profils & Groupes

| ID | Titre | Labels | Prio | Est. | Dépend de | Réf. |
|----|-------|--------|------|------|-----------|------|
| TLX-040 | GET/PATCH /athletes/:id — profil athlète | backend·api | High | 3 | TLX-024 | OpenAPI |
| TLX-041 | GET/POST /groups (+ gestion des membres) | backend·api | High | 5 | TLX-024 | OpenAPI · TX-DATA-006 |
| TLX-042 | Écran Profil athlète (A-10) | frontend | High | 3 | TLX-009 | Carte A-10 |
| TLX-043 | Écran Profil coach (C-11) | frontend | High | 3 | TLX-009 | Carte C-11 |
| TLX-044 | Écran Athlètes (C-02) | frontend | High | 5 | TLX-040, TLX-041 | Carte C-02 |
| TLX-045 | Écran Détail athlète (C-03) | frontend | High | 5 | TLX-044 | Carte C-03 |

#### Sessions

| ID | Titre | Labels | Prio | Est. | Dépend de | Réf. |
|----|-------|--------|------|------|-----------|------|
| TLX-050 | POST/GET /sessions — séances à blocs typés | backend·api | Urgent | 8 | TLX-012, TLX-024 | OpenAPI · Carte C-05 |
| TLX-051 | POST /assignments — assigner à un athlète ou un groupe | backend·api | Urgent | 5 | TLX-050 | OpenAPI |
| TLX-052 | Constructeur de séance (C-05) — canvas + en-tête [PARENT] | frontend | Urgent | 13 | TLX-006, TLX-009, TLX-050 | Carte C-05 |
| TLX-053 | Sélecteur de type de bloc (tous formats, groupé) | frontend | Urgent | 5 | TLX-052 | Carte C-05 §5 |
| TLX-054 | Éditeur de bloc — Fractionné / Intervalles | frontend | Urgent | 5 | TLX-052, TLX-053 | Carte C-05 §6 |
| TLX-055 | Éditeur de bloc — Répétitions de vitesse / Sprints | frontend | High | 3 | TLX-054 | Carte C-05 §6 |
| TLX-056 | Éditeur de bloc — Course continue / Tempo / Côtes / Fartlek | frontend | High | 3 | TLX-054 | Carte C-05 §6 |
| TLX-057 | Éditeur de bloc — Haies (rythme, hauteur, espacement) | frontend | High | 3 | TLX-054 | Carte C-05 §6 |
| TLX-058 | Éditeur de bloc — Sauts (élan, complets, pliométrie) | frontend | High | 3 | TLX-054 | Carte C-05 §6 |
| TLX-059 | Éditeur de bloc — Lancers (technique + complets) | frontend | High | 3 | TLX-054 | Carte C-05 §6 |
| TLX-060 | Éditeur de bloc — Musculation (séries × reps × charge) | frontend | High | 3 | TLX-054 | Carte C-05 §6 |
| TLX-061 | Éditeur de bloc — Gainage / Circuit / Échauffement / Retour au calme | frontend | Medium | 3 | TLX-054 | Carte C-05 §6 |
| TLX-062 | Cibles de bloc → pré-remplissage de la saisie de perf (A-04) | backend·frontend | High | 5 | TLX-050 | Carte C-05 §7 |
| TLX-063 | Écran Assignation (C-06) + Confirmation (C-07) | frontend | High | 5 | TLX-051, TLX-052 | Carte C-06/07 |
| TLX-064 | Bibliothèque de modèles de séance (C-10) | frontend·backend | Medium | 5 | TLX-050 | Carte C-10 |
| TLX-065 | Écran Séances athlète (A-02) + Détail séance (A-03) | frontend | High | 5 | TLX-009, TLX-050 | Carte A-02/03 |

#### Performances

| ID | Titre | Labels | Prio | Est. | Dépend de | Réf. |
|----|-------|--------|------|------|-----------|------|
| TLX-070 | POST/GET /performances (+ idempotence) | backend·api | Urgent | 8 | TLX-050, TLX-032 | OpenAPI · TX-SPEC-002 RB-05 |
| TLX-071 | Saisie de perf (A-04) — coquille + champs communs (RPE, ressenti, notes) [PARENT] | frontend | Urgent | 8 | TLX-009, TLX-070 | Carte A-04 §2/§5 |
| TLX-072 | Saisie — mode Temps (sprint/haies/demi-fond) | frontend | Urgent | 5 | TLX-071 | Carte A-04 §4.1 |
| TLX-073 | Saisie — mode Intervalles (fractionné/VMA) | frontend | Urgent | 5 | TLX-071, TLX-062 | Carte A-04 §4.2 |
| TLX-074 | Saisie — mode Série d'essais distance (sauts/lancers) | frontend | Urgent | 5 | TLX-071 | Carte A-04 §4.3 |
| TLX-075 | Saisie — mode Grille de barres (hauteur/perche) | frontend | Medium | 5 | TLX-071 | Carte A-04 §4.4 |
| TLX-076 | Détection de record (PB) + proposition de mise à jour | frontend·backend | High | 5 | TLX-070 | Carte A-04 §7 |
| TLX-077 | Brouillon auto-save + saisie hors-ligne + synchronisation | frontend·backend | Medium | 8 | TLX-071, TLX-010 | TX-ARCH-001 §4 |
| TLX-078 | Écran Confirmation de perf (A-05) | frontend | High | 3 | TLX-071 | Carte A-05 |

#### Pilotage coach

| ID | Titre | Labels | Prio | Est. | Dépend de | Réf. |
|----|-------|--------|------|------|-----------|------|
| TLX-080 | Dérivations API : KPIs, à revoir, aujourd'hui, alertes | backend·api | Urgent | 8 | TLX-070, TLX-051 | Carte C-01 §8 |
| TLX-081 | Tableau de bord coach (C-01) — vue principale [PARENT] | frontend | Urgent | 13 | TLX-009, TLX-080 | Carte C-01 |
| TLX-082 | Section À revoir + état positif « Rien à revoir » | frontend | Urgent | 3 | TLX-081 | Carte C-01 §4 |
| TLX-083 | Section Aujourd'hui (affectations + statuts) | frontend | Urgent | 3 | TLX-081 | Carte C-01 §4 |
| TLX-084 | Alertes & signaux (consentement, séance manquée…) | frontend·backend | High | 5 | TLX-080, TLX-081 | Carte C-01 §5 |
| TLX-085 | États première utilisation + tout est à jour | frontend | Medium | 3 | TLX-081 | Carte C-01 §6 |
| TLX-086 | Revue de performance + feedback (C-08) | frontend·backend | Urgent | 8 | TLX-070 | Carte C-08 |

#### Progression & Échanges

| ID | Titre | Labels | Prio | Est. | Dépend de | Réf. |
|----|-------|--------|------|------|-----------|------|
| TLX-090 | Écran Progression (A-06) — graphes par discipline | frontend·backend | High | 8 | TLX-070 | Carte A-06 |
| TLX-091 | Records personnels (A-07) | frontend·backend | High | 5 | TLX-076 | Carte A-07 |
| TLX-092 | Fil de feedback athlète (A-09) | frontend·backend | High | 5 | TLX-086 | Carte A-09 |
| TLX-110 | Notifications — infrastructure APNs/FCM | backend·infra | High | 8 | TLX-011 | TX-ARCH-001 §4.5 |
| TLX-111 | Notifications in-app + préférences | frontend·backend | Medium | 5 | TLX-110 | — |

#### Calendrier & Compétitions

| ID | Titre | Labels | Prio | Est. | Dépend de | Réf. |
|----|-------|--------|------|------|-----------|------|
| TLX-100 | Calendrier athlète (A-08) + coach (C-09) | frontend·backend | High | 8 | TLX-051 | Carte A-08/C-09 |
| TLX-101 | Compétitions — CRUD + engagement d'athlètes | backend·api·frontend | Medium | 8 | TLX-040 | OpenAPI |

#### Lancement & Qualité

| ID | Titre | Labels | Prio | Est. | Dépend de | Réf. |
|----|-------|--------|------|------|-----------|------|
| TLX-120 | Suite de tests (couverture cible) + tests de charge k6 | test·backend | High | 8 | TLX-015 | TX-OPS-004 §6 |
| TLX-121 | Migrations expand-contract + runbook | backend·infra | Medium | 5 | TLX-012 | TX-OPS-004 |
| TLX-122 | Build EAS iOS/Android + distribution | infra·frontend | High | 5 | TLX-007 | — |
| TLX-123 | Déploiement prod OVHcloud + observabilité | infra·backend | High | 8 | TLX-004, TLX-013 | TX-OPS-004 §5 |
| TLX-124 | Conformité RGPD finale (export, effacement, registre) | rgpd·backend | High | 5 | TLX-033, TLX-034 | TX-DPIA-007 |
---

## 6. Mettre le backlog dans Linear

### Méthode A — Import CSV (le plus rapide)
1. Dans Linear : **Settings → Import / Export → Import → CSV** (ou « Import issues » depuis l'équipe).
2. Charger `Talent-X_linear-import.csv`.
3. Mapper les colonnes : `Title → Title`, `Description → Description`, `Labels → Labels`, `Priority → Priority`, `Estimate → Estimate`, `Milestone → Project milestone` (créer le projet « Talent-X MVP » d'abord pour rattacher les jalons).
4. Importer, puis répartir les tickets dans les **cycles** selon le §4.

> Les **dépendances** (`Dépend de …`) figurent dans la description : crée les relations « Blocked by » à la main sur les quelques tickets critiques, ou laisse Claude Code le faire (méthode B).

### Méthode B — Claude Code via le MCP Linear (recommandé)
Tu as connecté le MCP Linear dans Claude Code : laisse-le créer les tickets. Ouvre Claude Code à la racine du dépôt avec le CSV et ce fichier accessibles, puis :

```
Tu as accès au MCP Linear. Crée le backlog Talent-X dans l'équipe TLX, projet « Talent-X MVP ».
Source : Talent-X_linear-import.csv (78 tickets) + Talent-X_structure-tickets_v2.md (jalons, cadence, dépendances).
Pour chaque ligne du CSV :
- crée une issue avec Title, Description, Labels, Priority, Estimate ;
- rattache-la au jalon (Milestone) indiqué, en créant les jalons manquants du §2 ;
- crée les relations « Blocked by » d'après le champ « Dépend de » de la description ;
- transforme en sous-issues les tickets listés sous chaque [PARENT] (TLX-052, TLX-071, TLX-081).
Affiche un récapitulatif (nb d'issues, jalons, relations créées) et NE crée aucun doublon si tu relances.
```

## 7. Rappels pour travailler avec Claude Code
- Garder à la racine `CLAUDE.md` (stack + conventions) et `CURRENT_SPRINT.md` (cycle en cours) — cf. v1.
- Branches `feature/TLX-052-...` ; commits `feat(TLX-052): ...` (Conventional Commits).
- Démarrer chaque session par : « Lis CLAUDE.md et CURRENT_SPRINT.md, puis travaille sur TLX-0XX. »
- Travailler **dans l'ordre des dépendances** : Fondations → Auth/RGPD → le reste.
