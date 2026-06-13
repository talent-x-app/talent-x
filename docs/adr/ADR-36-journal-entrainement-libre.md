## ADR-36 — Journal d'entraînement : séance libre auto-créée par l'athlète (complément ADR-20/21/31)

- **Statut :** Accepté (validé 2026-06-13)
- **Date :** 2026-06-13
- **Décisions validées :** (1) **modèle** = séance **auto-possédée par l'athlète** (`coachId = athleteId`, statut dédié `self_logged`) + auto-affectation `completed` + perf, atomique (**Option 1** retenue, vs Option 2 `coachId` nullable écartée) ; (2) un endpoint athlète **`POST /athletes/me/training-log`** (vs extension de `/sessions`) ; (3) la séance libre **alimente progression/records/assiduité** de l'athlète, mais **pas** les stats d'adhésion du coach (naturellement, car coach-scopées).
- **Réf. :** Linear TLX-111 · RB-03/09 (perf exige une affectation) · ADR-20 (records, dérivation athleteId-scopée) · ADR-21 (progression athleteId-scopée) · ADR-31 (cycle de vie/assiduité) · ADR-17 (stats coach = coach-scopées) · ADR-29 (statut additif `template`, méthode CHECK expand-only) · `performances.service.ts` · `assignments.service.ts`

**Contexte.** Une `Performance` est **1:1 avec une `SessionAssignment`** (`performances.assignment_id`
unique) créée par l'**affectation du coach** (RB-03/09). L'athlète qui fait une **séance libre** (footing,
entraînement en vacances, séance non programmée) **n'a aucun moyen de la consigner** : pas d'affectation
→ pas de perf → rien dans sa progression/ses records. Pour l'objectif « **historique d'entraînement** »
(et comme canal d'acquisition d'athlètes **sans coach**), c'est une lacune structurante. Le ticket
demande une séance/affectation **auto-créée par l'athlète**, statut dédié, alimentant progression/
records/assiduité **comme une perf normale**, visible du coach **sous consentement**.

**Contrainte structurante.** Tout l'aval (progression ADR-21, records ADR-20, assiduité ADR-31) est
**indexé sur `athlete_id`** et joint `assignment → session → exercises` pour dériver les clés d'épreuve.
Une perf « libre » doit donc porter **les trois maillons** (séance avec blocs typés, affectation,
perf) pour alimenter l'aval **sans le réécrire**. Mais les séances sont **possédées par un coach**
(`sessions.coach_id` NOT NULL). Comment représenter une séance **sans coach** ? Décision de modèle non
tranchée par les specs (CLAUDE.md §7) → ADR.

**Décision.**

### 1. Modèle — séance auto-possédée par l'athlète, statut `self_logged` (Option 1)

Une saisie libre crée **atomiquement** (une transaction) les trois maillons existants, **inchangés** :

- une **`Session`** avec **`coach_id = athleteId`** (l'athlète est le créateur/propriétaire de sa
  propre séance), **`status = 'self_logged'`** (valeur de statut **additive**, CHECK expand-only —
  même méthode qu'ADR-29 pour `template`), `scheduled_date = date`, `exercises` (blocs typés fournis) ;
- une **`SessionAssignment`** (`athleteId`, `sessionId`, **`status = 'completed'`**, `due_date = date`) ;
- une **`Performance`** (`results`, `rpe`, `notes`, `submitted_at = date` — la **date d'entraînement**
  pilote progression/records, pas l'heure de saisie).

**Aucune table, aucun index, aucune dérivation ne change** : la maille d'exécution est identique à une
séance affectée puis réalisée. Progression, records, assiduité, détection de PB (candidats renvoyés
comme à la soumission) fonctionnent **tels quels** (athleteId-scopés).

Le statut **`self_logged`** est le marqueur explicite qui (a) distingue la séance libre d'une séance de
coach, (b) documente que `coach_id` porte ici l'**athlète** lui-même, (c) permet aux écrans de
filtrer/étiqueter (« séance libre »). C'est le point que l'ADR fige pour lever le smell de `coach_id`.

Choisi **contre l'Option 2** (`sessions.coach_id` **nullable** + colonne propriétaire) : rendre
`coach_id` nullable a un **rayon de souffle large** (le champ est lu non-null dans tous les contrôles
d'ownership, scopes dashboard, mappers — `coachId: string` partout deviendrait `string | null`), pour
un gain purement sémantique. L'Option 1 garde `coach_id` NOT NULL (= `athleteId` pour une séance libre)
et isole la sémantique dans un **statut**, sans toucher le reste. Rejetée.

### 2. Contrat — endpoint athlète dédié `POST /athletes/me/training-log`

Nouvel endpoint **athlète** (role `athlete`, porte `data_processing` — même règle que la saisie de
perf) :

```
POST /athletes/me/training-log
TrainingLogRequest = {
  title:     string,
  date:      date,                 // date de l'entraînement (séance + échéance + submittedAt)
  exercises: ExercisesDoc,         // blocs typés (mêmes schémas que SessionCreate) → clés d'épreuve
  results:   ResultsDoc,           // mesures (mêmes schémas que la saisie de perf)
  rpe?:      int 1..10,
  notes?:    string
}
→ 201 Performance (recordCandidates inclus, comme la soumission — ADR-20)
```

Choisi **contre** une extension de `POST /sessions` côté athlète : `/sessions` est **coach-only**
(RBAC) et ne crée ni affectation ni perf ; un endpoint athlète dédié exprime l'intention (« je consigne
ma séance »), porte le consentement, et compose les trois écritures atomiquement. OpenAPI
(`TrainingLogRequest`) → DTO Nest → client orval régénéré.

### 3. Visibilité coach — sous consentement, sans polluer le pilotage

Une séance libre a **`coach_id = athleteId`** → elle **n'apparaît pas** dans le tableau de bord/stats du
coach (coach-scopés sur `session.coach_id = coach.id`, ADR-17) : le pilotage du coach reste **son** plan,
non pollué par l'entraînement libre. En revanche, **progression & records** (athleteId-scopés,
**consent-gated `coach_access`**, ADR-20/21 + miroir coach TLX-112) **incluent** les séances libres : le
coach lié et consenti voit les marques libres de l'athlète. C'est exactement « visible du coach sous
consentement » via les **portes existantes**, sans code d'autorisation neuf.

### 4. Progression / records / assiduité — alimentés comme une perf normale

Côté **athlète**, la séance libre alimente :
- **records** (ADR-20) : détection de PB à la création (candidats renvoyés, confirmation inchangée) ;
- **progression** (ADR-21) : un point daté de plus par épreuve + SB/marques par année (ADR-34) ;
- **assiduité** (ADR-31/TLX-115, vue **athlète**, athleteId-scopée) : comptée comme réalisée (favorise
  la régularité — l'objectif rétention du ticket).

L'**adhésion vue par le coach** (stats ADR-17, coach-scopées) **exclut** les séances libres → pas de
distorsion du taux de complétion du plan du coach. Asymétrie **assumée et saine** : l'athlète voit son
activité **totale**, le coach voit l'adhésion à **son** plan.

### 5. Cycle de vie & garde-fous

- La séance libre naît **`completed`** (l'athlète consigne du réalisé). Correction de la marque = chemin
  **PUT perf** existant (ADR-33 : tracé). Suppression = soft-delete de l'affectation/séance (chemins
  existants, propriétaire = l'athlète).
- `self_logged` n'est **pas assignable** par autrui (athlètes hors endpoint coach ; `coach_id` =
  l'athlète). Pas de fuite : scope athlète = ses propres affectations.
- RGPD : aucune donnée nouvelle de nature différente (séance/affectation/perf de l'athlète) → export/
  effacement (ADR-14/15) opèrent déjà sur ces tables par `athlete_id`/`coach_id`.

**Conséquences.**

- **+** Lacune « historique d'entraînement » comblée en **réutilisant toute** la machinerie
  (progression/records/assiduité/détection PB) ; **une seule migration additive** (statut `self_logged`,
  expand-only) ; visibilité coach via les **portes existantes** ; canal d'acquisition (athlète sans coach
  peut consigner et constituer son historique).
- **À assumer :** `coach_id` porte l'athlète pour une séance libre (smell levé par le statut explicite) ;
  l'assiduité **athlète** intègre le libre (choix rétention assumé ; le coach n'est pas impacté) ; l'UI
  doit offrir un mini-constructeur (≥1 bloc typé + résultat) — bornée en réutilisant les éditeurs
  existants.
- **Écartées :** (a) **Option 2** `coach_id` nullable — rayon de souffle large pour un gain sémantique ;
  (b) **perf sans affectation** (assignment_id nullable + exercices embarqués sur la perf) — casse le 1:1
  et oblige à réécrire la dérivation records/progression ; (c) extension coach-only de `/sessions` —
  mauvais rôle, ne compose pas affectation+perf ; (d) faire apparaître le libre dans le **dashboard
  coach** — pollue le pilotage du plan.

**Périmètre de livraison (après acceptation).** Migration expand-only (CHECK `sessions.status` +=
`self_logged`) → contrat (`TrainingLogRequest`, `POST /athletes/me/training-log`) + DTO/orval →
`TrainingLogService` (création atomique séance/affectation/perf, consent `data_processing`, candidats
records) → tests (service : atomicité, consentement, candidats ; intégration DB-backed : libre →
progression/records/assiduité alimentés, exclu du dashboard coach, visible en progress coach sous
consentement) → UI athlète « Enregistrer une séance libre » (mini-constructeur : titre, date, bloc typé
+ résultat, RPE, notes) + entrée depuis l'Accueil/Progression + tests.
