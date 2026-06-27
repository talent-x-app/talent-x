# Rapport de test manuel — Parcours COACH

**Date** : 2026-06-24 · **Cible** : Expo web (`react-native-web`) sur `localhost:8081`, API NestJS + worker + Postgres/Redis/MinIO en local.
**Méthode** : parcours manuel guidé, du point de vue d'un coach, sur un jeu de données seedé (coach + 3 athlètes + groupe + séances + perf soumise + annonce).

**Écrans parcourus** : dashboard, centre de notifications, revue de performance + feedback, consentement (`coach_access`), création de séance (assistant par discipline), assignation, **récurrence**, groupe (membres / QR / annonces / renommage / régénération de code / retrait de membre), fiche athlète, calendrier, profil (édition / préférences / confidentialité / **export RGPD**), **templates**.

> 18 remarques relevées. Deux échecs rencontrés (R8, R14) se sont avérés **environnementaux** (cache de bundling / config locale) et non applicatifs — détaillés + résolus en cours de test.

---

## Synthèse

| #   | Remarque                                                             | Catégorie          | Sévérité  | Écran principal             |
| --- | -------------------------------------------------------------------- | ------------------ | --------- | --------------------------- |
| R3  | Reload web ⇒ déconnexion (session non persistée)                     | Bug                | **Haute** | bootstrap / auth web        |
| R6  | Chevauchement des saisies de séries en largeur téléphone             | Bug (responsive)   | **Haute** | builder (canvas discipline) |
| R2  | Toasts « Accès refusé » redondants **et empilés** (×3)               | Bug (UX)           | Moyenne   | revue + fiche athlète       |
| R15 | Pas de visibilité « à qui » une séance est assignée                  | Manque UI          | Moyenne   | détail séance               |
| R16 | Pas de suppression de séance (bouton manquant)                       | Manque UI          | Moyenne   | détail séance               |
| R18 | Occurrences de récurrence affichées « SANS DATE »                    | Bug (calendrier)   | Moyenne   | calendrier coach            |
| R11 | Calendrier coach daté ; aligner sur celui de l'athlète (+ recherche) | UX                 | Moyenne   | calendrier coach            |
| R1  | Notifications génériques (« un athlète… ») au lieu du nom            | UX                 | Basse     | notifications               |
| R5  | Champ date = texte, pas de date picker                               | UX                 | Basse     | builder + assignation       |
| R7  | Pas d'option « assigner plus tard » après création                   | UX (flux)          | Basse     | post-création séance        |
| R9  | Graphe de progression peu moderne                                    | UX                 | Basse     | fiche athlète               |
| R10 | Wording « Séances réalisées » vs « À revoir »                        | UX                 | Basse     | fiche athlète               |
| R12 | Champ « Discipline » ambigu pour un coach                            | UX                 | Basse     | profil                      |
| R13 | « Actualités Talent-X » présent deux fois                            | UX                 | Basse     | profil                      |
| R17 | Création de modèle ≠ création de séance (pas d'assistant)            | UX (cohérence)     | Basse     | templates / new session     |
| R8  | Crash liste groupes (`groups.map is not a function`)                 | **Env (résolu)**   | —         | —                           |
| R14 | Export RGPD échoue                                                   | **Env (résolu)**   | —         | —                           |
| R4  | « 0/1 exercices réalisés »                                           | **Non-bug (seed)** | —         | —                           |

---

## 🐞 Bugs & manques (à corriger)

### R3 — Reload web ⇒ retour à la connexion (session non persistée) · **Haute**

Recharger la page (F5) sur une route coach renvoie sur `/login` **et exige de re-saisir email + mot de passe** : la session n'est pas restaurée côté web (ce n'est pas un simple flash). Défaut connu (les fixtures e2e le contournent via `gotoAuthed`, et `tlx-130` le commente pour le calendrier) — le contournement est un _smell_.
**Fix** : investiguer le stockage/restauration du token côté web (persistance + hydratation auth au démarrage).

### R6 — Chevauchement des saisies de séries en largeur téléphone · **Haute**

Sur écran large, les champs d'une série (DISTANCE / INTENSITÉ / RÉCUP R) s'affichent bien ; en **largeur téléphone**, ils **se chevauchent** (ex. « →R 95 % » empilé sur la colonne récup, champs écrasés). Vrai défaut de layout responsive.
**Écran** : carte d'effort dans `SessionBuilderScreen` / `discipline-canvas`.

### R2 — Toasts « Accès refusé » redondants et empilés · Moyenne

Ouvrir une ressource d'un athlète sans consentement `coach_access` affiche **à la fois** la carte « Cet athlète n'a pas autorisé l'accès à ses données » **et** des toasts rouges « Accès refusé · Consentement requis ». Sur la **fiche athlète**, **3 toasts s'empilent** (un par requête gatée : stats / progression / records).
**Fix** : ne pas émettre de toast sur `CONSENT_REQUIRED` (la carte suffit), ou dédupliquer. Écrans : revue `/review/[id]`, `AthleteDetailScreen`.

### R15 — Pas de visibilité sur « à qui » une séance est assignée · Moyenne

Après assignation (y compris récurrente), rien n'indique quels athlètes ont la séance.
**Fix (UI seulement, donnée dispo)** : afficher sur `CoachSessionDetailScreen` une section « Assigné à : … » (statuts à jour/en retard) via `GET /assignments` filtré par séance ; et/ou pré-cocher les athlètes déjà assignés sur l'écran d'assignation.

### R16 — Impossible de supprimer une séance · Moyenne

Le détail de séance n'expose que **Éditer** + **Assigner**. L'endpoint **`DELETE /sessions/:id` existe (204)** — il manque l'action UI (avec confirmation), comme pour les groupes/templates.

### R18 — Occurrences de récurrence affichées « SANS DATE » · Moyenne

Répéter une séance crée plusieurs « 200m allure course » qui s'empilent en « SANS DATE » dans le calendrier.

- **La duplication de séance par occurrence est INTENTIONNELLE** (ADR-35, Option A) : l'index `ux_assignment_active (session_id, athlete_id)` interdit deux affectations actives de la même séance au même athlète → chaque occurrence = une séance distincte. **Ce n'est pas un bug.**
- **Le vrai défaut** : les occurrences **sont datées** (dueDate sur l'affectation : 05/07, 12/07, 19/07, 26/07…) mais le **calendrier coach les classe en « SANS DATE »** car il liste les _séances_ (non datées) au lieu de placer chaque occurrence sur le jour de son _affectation_.
  **Fix** : positionner les entrées du calendrier sur **`assignment.dueDate`** ; idéalement regrouper visuellement les doublons d'une même récurrence. À traiter avec **R11**.

### R11 — Calendrier coach daté ; harmoniser avec celui de l'athlète · Moyenne

L'affichage du calendrier coach est jugé daté. Côté athlète il existe un meilleur modèle (avec **recherche**).
**Fix** : réutiliser le composant/UX du calendrier athlète côté coach. (Navigation entre mois : OK.)

---

## 🎨 UX / produit (à arbitrer)

- **R1 — Notifications nominatives.** Afficher le nom (« Léa a rejoint votre groupe ») au lieu de « Un athlète… ». _Impact contrat_ : le backend n'envoie que `type` + `resourceId` (ADR-23) → enrichir le payload (nom de l'acteur) ou résoudre côté client. Écran : `notification-ui.ts`.
- ~~**R5 — Date picker moderne.** Les dates (date prévue, échéance) sont des champs texte `AAAA-MM-JJ`.~~ ✅ Résolu (TLX-197) : sélecteur calendaire cross-platform (`DatePicker`) sur `session-field-date`, `assign-due-date`, `assign-repeat-until`, `competition-field-start/end`.
- **R7 — « Assigner plus tard ».** La création de séance redirige de force vers l'assignation, sans échappatoire. Ajouter une sortie (retour détail/liste).
- **R9 — Graphe de progression** peu moderne. `AthleteDetailScreen` → `CoachProgressSection` (partagé avec la vue athlète A-06).
- **R10 — Wording.** « Séances réalisées » (fiche athlète) vs « À revoir » (dashboard) pour la même action de revue.
- **R12 — Champ « Discipline » dans le profil coach** : pertinent pour un athlète, ambigu pour un coach. À retirer/repenser (`ProfileScreen`, champ `profile-sport`).
- **R13 — « Actualités Talent-X » en double** : préférence de notification **et** consentement marketing portent le même libellé → confusion. Écrans : `ProfileScreen` + `PrivacySection`.
- **R17 — Création de modèle ≠ création de séance** : « Créer une séance » passe par l'assistant par discipline ; « Créer un modèle » ouvre le constructeur brut. Aligner les deux entrées.

---

## ⚙️ Échecs environnementaux rencontrés (résolus en cours de test — pas des bugs applicatifs)

### R8 — Crash « Gérer mes groupes » : `groups.map is not a function`

`GET /groups` (API) et le code source de l'écran sont **corrects** (`{ data: [...] }` → `response.data.data`). Le crash venait d'un **bundle Metro obsolète** servant une ancienne version de `@talent-x/api-client`.
**Résolution** : rebuild api-client + **tuer le serveur web** (TaskStop ne suffit pas : le process Metro détaché garde le port 8081) + `expo start --web --clear`. Après vidage du cache, la liste s'affiche.
**À retenir** : un `dist/` frais ne suffit pas si Metro tournait déjà → relancer avec `--clear`. (Même famille que la « régression dist périmé », matrice §3.)

### R14 — Export RGPD échoue

Cause (log worker) : `Configuration stockage objet absente : S3_ENDPOINT requis`. Dans `apps/api/.env`, **tout le bloc S3 est commenté** alors que **MinIO tourne** (:9000).
**Résolution** : décommenter le bloc MinIO dev (`S3_ENDPOINT=http://localhost:9000`, bucket `talentx-exports`, clés `talentx`/`talentx-dev-secret`), créer le bucket, redémarrer API + worker. Export ensuite **`status: ready` + URL présignée** ✔.
**Piège associé** : `nest start --watch` lance un **process applicatif enfant** distinct du watcher ; le tuer (ou TaskStop) laisse l'enfant **vivant** → plusieurs runs = N workers fantômes consommant la même file BullMQ, certains sans la nouvelle config → jobs en échec aléatoire. Vérifier `wmic process … | grep dist\\worker` et tout tuer avant de relancer **un seul** worker.

> **Recommandation runbook dev** : documenter (a) le lancement du **worker** (`pnpm --filter @talent-x/api worker:dev`) en plus de l'API, et (b) la **config MinIO** (bloc S3 du `.env`). Sans l'un ou l'autre, notifications in-app et export RGPD sont cassés en local par défaut.

---

## ✅ Non-bug / clarifié

### R4 — « 0/1 exercices réalisés » alors qu'une mesure existe

**Artefact de seed** : la perf avait été injectée par l'API sans le flag `completed` sur le set. Après re-soumission avec `completed: true`, la revue affiche **1/1**. Pas un bug applicatif. (Détail mineur : il a fallu recharger pour voir la mise à jour — cache, lié à R3.)
_Point UX résiduel_ : afficher une mesure ET « 0 réalisé » serait déroutant — à garder en tête pour la validation des saisies.

---

## Observations techniques

- **Gate `coach_access`** : la revue et la fiche athlète sont **cloisonnées** tant que l'athlète n'a pas accordé `coach_access` (cohérent avec l'alerte dashboard « consentements d'accès manquants »). Contraste vérifié : Léa (consentement OK) visible, Yanis (sans) bloqué. ✔ RGPD respecté.
- **Lacune de couverture e2e** : `tlx-140` passe alors que la revue peut être bloquée par consentement — il n'assure que la présence de `review-title`, **pas** la lecture effective de la perf. Le test ne détecterait pas une régression du cloisonnement côté contenu.

---

_Rapport établi à l'issue du parcours coach manuel. Les actions destructives (suppression de groupe, suppression de compte) n'ont volontairement pas été exécutées pour préserver le jeu de données._
