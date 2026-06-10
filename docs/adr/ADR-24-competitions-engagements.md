## ADR-24 — Compétitions & engagements d'athlètes (modèle, contrat, autorisation, RGPD)

- **Statut :** Accepté (validé 2026-06-10)
- **Date :** 2026-06-10
- **Réf. :** TLX-101 (Carte « Compétitions ») · TX-DATA-006 (modèle de données) · TX-SPEC-002 §6 (autorisation) · TX-SEC-003 (RGPD) · `talent-x-openapi.yaml` · ADR-08 (autorisation) · ADR-12 (expand-contract) · TLX-100 (calendrier)

**Contexte.** TLX-101 demande « Compétitions — CRUD + engagement d'athlètes », réf. « OpenAPI ».
Or **rien n'existe** : aucune entité dans TX-DATA-006, aucun chemin `/competitions` dans le
contrat OpenAPI, aucun modèle Prisma, aucun écran maquetté dans le UI kit. Le jalon « Calendrier
& Compétitions » complète TLX-100. Implémenter ce ticket suppose donc d'**inventer** l'entité, le
contrat d'API, la matrice d'autorisation et la **classification RGPD** — décisions structurantes
que les specs ne tranchent pas (CLAUDE.md §7) → ADR avant tout code.

**Décision.**

### 1. Modèle de données (2 tables, migration expand-only, méthode ADR-12)

**`competitions`** — événement appartenant à un coach (miroir de `sessions`) :

| Colonne | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `coach_id` | uuid FK→users | `onDelete: Restrict` |
| `name` | text NOT NULL | intitulé de la compétition |
| `discipline` | text NULL | libre au MVP (ex. « Sprint », « Saut ») |
| `location` | text NULL | lieu |
| `start_date` | date NOT NULL | jour de début |
| `end_date` | date NULL | `CHECK (end_date IS NULL OR end_date >= start_date)` |
| `description` | text NULL | |
| `status` | text NOT NULL `'draft'` | `CHECK IN ('draft','published','cancelled')` |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | soft-delete |

Index : `ix_competitions_date (start_date)` ; index **partiel** `ix_competitions_coach (coach_id) WHERE deleted_at IS NULL` (migration SQL).

**`competition_entries`** — engagement d'un athlète (miroir de `session_assignments`) :

| Colonne | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `competition_id` | uuid FK→competitions | `onDelete: Cascade` |
| `athlete_id` | uuid FK→users | `onDelete: Cascade` |
| `event_label` | text NULL | l'épreuve, **libre au MVP** (non relié aux clés ADR-20) |
| `status` | text NOT NULL `'engaged'` | `CHECK IN ('engaged','confirmed','withdrawn')` |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | soft-delete |

Unicité **partielle** `ux_entry_active (competition_id, athlete_id) WHERE deleted_at IS NULL` →
**idempotence** de l'engagement (un athlète engagé une fois, sans doublon — même mécanique que
`ux_assignment_active`). Index `ix_entry_athlete (athlete_id)`. **Un engagement par athlète et par
compétition au MVP** ; le multi-épreuves (unicité élargie à `event_label`) est repoussé.

### 2. Contrat d'API (additif OpenAPI, préfixe `/api/v1`) — miroir sessions/assignments

- `POST /competitions` (coach) → 201, `CompetitionCreate`.
- `GET /competitions` — **role-aware** : coach = les siennes ; athlète = celles où il est engagé. Enveloppe `{ data, meta }`.
- `GET /competitions/{id}` — coach propriétaire **ou** athlète engagé.
- `PUT /competitions/{id}` — coach propriétaire.
- `DELETE /competitions/{id}` — coach propriétaire (soft-delete).
- `POST /competitions/{id}/entries` — coach propriétaire, vers des athlètes **liés**, **idempotent** (en-tête `Idempotency-Key` exigé comme `assign`). Body `{ athleteIds: uuid[], eventLabel?: string }`.
- `GET /competitions/{id}/entries` — coach propriétaire ou athlète engagé.
- `DELETE /competitions/{id}/entries/{entryId}` — coach propriétaire (désengage = soft-delete).

Schémas additifs : `Competition`, `CompetitionCreate`, `CompetitionUpdate`, `CompetitionStatus`,
`CompetitionEntry`, `CompetitionEntryStatus`, `EngageRequest`, `CompetitionPage`,
`CompetitionEntryList`. Client orval régénéré.

### 3. Autorisation (matrice TX-SPEC-002 §6, alignée sur les affectations)

- La compétition est une ressource **propriété du coach** ; l'athlète y accède **en lecture s'il est
  engagé**.
- L'engagement est réservé au **coach propriétaire**, vers des athlètes qui lui sont **liés**
  (`assertCoachLinkedToAthlete`), idempotent via l'index unique partiel.
- L'athlète ne modifie pas son engagement au MVP (pas d'auto-inscription) ; il **consulte**.

### 4. RGPD — classification explicite

Une compétition (nom, date, lieu) et un engagement (athlète inscrit à un événement) sont des
**données de planification, PAS des données de santé** au sens du projet (≠ performances/records).
**Aucune porte de consentement** `data_processing`/`coach_access` : l'accès est gouverné par
**rôle + propriété + lien actif** uniquement. Les **résultats** d'une compétition (marques chiffrées)
seraient, eux, des données de santé → **hors périmètre** de ce ticket (futur, via le mécanisme
performances/records existant). Inclusion **additive** dans l'export (ADR-14) et l'effacement
(ADR-15) : compétitions du coach + engagements de l'athlète.

### 5. Intégration calendrier (TLX-100)

Les compétitions étant datées, elles **enrichissent** le calendrier : l'athlète y voit ses
engagements, le coach ses compétitions, comme **entrées distinctes** (tonalité dédiée + libellé
« Compétition »), via un adaptateur `competitionToCalendarEntry` réutilisant `CalendarView`.
**Proposé dans le périmètre de ce ticket** pour la cohésion du jalon ; déclassable en suivi
immédiat si le lot est trop gros.

### 6. UI (aucune maquette → design system)

- **Coach** : liste Compétitions, constructeur création/édition (variante allégée de C-05), écran
  d'engagement multi-athlètes (miroir de `CoachAssignScreen`).
- **Athlète** : liste de ses compétitions + détail (lecture seule).
- **Navigation** : proposée **sans 6ᵉ onglet** — entrée depuis le Calendrier (et/ou l'Accueil),
  routes empilées. (À confirmer.)

**Conséquences.**

- Positives : complète le jalon ; réutilise massivement les patterns sessions/assignments (mapper,
  ownership, idempotence structurelle, pagination, role-aware) ; **pas de dette RGPD** (classification
  explicite) ; le calendrier est déjà prêt à accueillir un 2ᵉ type d'entrée.
- Négatives : nouvelle surface API + UI à tester ; `event_label` **libre** (non relié aux clés
  d'épreuve ADR-20) — dette assumée, à typer plus tard ; multi-épreuves par athlète repoussé ;
  les résultats de compétition restent à spécifier.

**Alternatives considérées.**

- **Réutiliser `sessions` pour les compétitions** (un « type de séance ») : rejeté — sémantique
  différente (événement externe vs séance d'entraînement), pollue le modèle séance et les
  dérivations de pilotage coach.
- **Engagement initié par l'athlète** (auto-inscription) : rejeté au MVP — le coach pilote
  (cohérent avec `assign`) ; ouverture possible ultérieurement.
- **Porte de consentement sur les compétitions** : rejeté — sur-gating de données non sensibles ;
  le consentement reste réservé aux données de santé (les résultats).
- **Résultats de compétition dans ce ticket** : rejeté — données de santé ; étendre le mécanisme
  records/perfs existant, hors « CRUD + engagement ».

**Questions tranchées (validation 2026-06-10).**

1. **Périmètre calendrier** : ✅ **intégré dans ce ticket** — les compétitions enrichissent le
   calendrier TLX-100 (entrée distincte) en plus des écrans dédiés.
2. **Navigation** : ✅ **pas de 6ᵉ onglet** — routes empilées accessibles depuis le Calendrier.
3. **`event_label`** : ✅ **texte libre au MVP** ; typage via les clés d'épreuve ADR-20 repoussé.
4. **Statuts d'engagement** : ✅ **`engaged`/`confirmed`/`withdrawn`**.
