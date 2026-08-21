## ADR-36 — Journal d'entraînement : séance libre auto-créée par l'athlète (complément ADR-20/21/31)

- **Statut :** Accepté (validé 2026-06-13)
- **Date :** 2026-06-13
- **Décisions validées :** (1) **modèle** = séance **auto-possédée par l'athlète** (`coachId = athleteId`, statut dédié `self_logged`) + auto-affectation `completed` + perf, atomique (**Option 1** retenue, vs Option 2 `coachId` nullable écartée) ; (2) un endpoint athlète **`POST /athletes/me/training-log`** (vs extension de `/sessions`) ; (3) la séance libre **alimente progression/records/assiduité** de l'athlète, mais **pas** les stats d'adhésion du coach (naturellement, car coach-scopées).
- **Amendé par :** **ADR-51 §D3** (2026-06-24) — §3 ci-dessous : la lecture coach est cloisonnée aux séances dont le coach est l'auteur, elle **exclut** donc les séances libres (acté le 2026-08-20, TLX-248).
- **Réf. :** Linear TLX-111 · RB-03/09 (perf exige une affectation) · ADR-20 (records, dérivation athleteId-scopée) · ADR-21 (progression athleteId-scopée) · ADR-31 (cycle de vie/assiduité) · ADR-17 (stats coach = coach-scopées) · ADR-29 (statut additif `template`, méthode CHECK expand-only) · **ADR-51 §D3** (cloisonnement de la lecture coach) · `performances.service.ts` · `assignments.service.ts`

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

### 3. Visibilité coach — le coach ne voit pas l'entraînement libre

> **Amendé le 2026-08-20 par ADR-51 §D3 (TLX-248).** La rédaction d'origine — reproduite plus bas —
> annonçait l'inverse. Elle est **périmée depuis le 2026-06-24** et décrivait une exposition de
> données que le code n'a jamais faite.

Une séance libre a **`coach_id = athleteId`** → elle **n'apparaît pas** dans le tableau de bord/stats du
coach (coach-scopés sur `session.coach_id = coach.id`, ADR-17) : le pilotage du coach reste **son** plan,
non pollué par l'entraînement libre.

**Progression et records côté coach ne l'incluent pas davantage.** ADR-51 §D3 borne toute lecture
coach des données d'un athlète aux **séances dont le coach est l'auteur** (`session.coachId ===
coachId`). Une séance libre porte `coach_id = athleteId` : elle échoue à ce filtre. Le coach lié et
consenti **ne voit donc pas** les marques libres de son athlète — le consentement `coach_access`
ouvre l'accès aux données du **plan du coach**, pas à l'entraînement personnel.

**Intention confirmée par le propriétaire le 2026-08-20 :** « le coach ne doit pas voir
l'entraînement libre de son athlète, même consenti. » C'est cohérent avec la minimisation et avec
l'asymétrie déjà assumée en §4 — l'athlète voit son activité totale, le coach voit **son** plan.

Vérifié sur staging (QA-03.8) : cinq lectures coach (`progress`, `records`, `stats`,
`coach/dashboard`, `sessions`) ne contiennent aucune des marques libres, alors que la **même sonde**
passée sur le compte de l'athlète les trouve — l'absence côté coach est une mesure, pas un artefact.

<details>
<summary>Rédaction d'origine (2026-06-13), conservée pour l'historique — <strong>ne pas
appliquer</strong></summary>

> En revanche, **progression & records** (athleteId-scopés, **consent-gated `coach_access`**,
> ADR-20/21 + miroir coach TLX-112) **incluent** les séances libres : le coach lié et consenti voit
> les marques libres de l'athlète. C'est exactement « visible du coach sous consentement » via les
> **portes existantes**, sans code d'autorisation neuf.

Ce texte a précédé ADR-51 (multi-coach, 2026-06-24), qui a cloisonné les lectures coach sans citer
ADR-36. Le laisser tel quel poussait un lecteur à « corriger » une absence qui est la règle — soit
exactement la régression de confidentialité que §D3 existe pour empêcher.

</details>

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
  **PUT perf** existant (ADR-33 : tracé). Suppression : voir l'**amendement du 2026-08-20** ci-dessous
  — la rédaction d'origine (« soft-delete de l'affectation/séance, **chemins existants**,
  propriétaire = l'athlète ») décrivait un chemin qui **n'existait pas**.
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
+ résultat, RPE, notes) + entrée depuis l'écran **Séances** (voir *Amendement 2026-08-20*) + tests.

---

## Amendement — 2026-08-20 (TLX-249) : l'entrée vit sur l'écran Séances

Le périmètre ci-dessus plaçait l'entrée « Enregistrer une séance libre » « depuis l'Accueil/
Progression ». **Le livré n'a jamais correspondu à ce texte** : le composant n'était monté qu'à un
seul endroit, l'écran Progression, et l'entrée depuis l'Accueil n'a pas existé.

En déroulant QA-03.8 sur appareil, **le propriétaire du produit n'a pas trouvé l'entrée** et l'a
cherchée dans « Mes séances ». Arbitrage du 2026-08-20 :

> concernant les séances libre, je veux que enregistrer une séance libre soit mis dans l'écran
> « Séances » et enlever de progression même s'il faut modifier l'adr

**Décision.** L'entrée est sur l'écran **Séances** (A-02), et **nulle part ailleurs** — elle est
retirée de Progression. Raison de fond, au-delà de la préférence : Progression est un écran de
**consultation** (graphes, records, assiduité) ; consigner une séance est une **écriture**. L'entrée
était rangée là où l'athlète vient lire, et c'est aussi là qu'il cherche ce qu'il a déjà fait, pas
où il déclare ce qu'il vient de faire.

**Conséquences.**

- Le composant est **autonome** (replié par défaut, aucune dépendance à la progression) : il porte
  lui-même l'invalidation des caches `['progress','me']`, records et `['assignments']` après
  enregistrement. Rien n'est perdu au déplacement — la progression se rafraîchit quand on y revient.
- Il est rendu **hors** des états de la requête `GET /assignments` : un athlète **sans coach** n'a
  aucune affectation, tombe sur l'état vide, et doit malgré tout pouvoir consigner. C'est le canal
  d'acquisition annoncé en *Contexte* ; le laisser dans la branche « liste non vide » l'aurait
  refermé.
- Corollaire d'étiquetage : les séances libres apparaissent dans la même liste que celles du coach,
  et le badge d'affectation dit « Réalisée » pour les deux. La liste porte donc désormais
  l'étiquette **« Séance libre »**, de la même source que le calendrier (`SESSION_STATUS_META`) —
  §3/§4 font de cette séparation une règle de visibilité, elle ne pouvait pas rester invisible à
  l'écran.

**Réf. :** Linear TLX-249 · scénario QA-03.8 · `AthleteSessionsScreen.tsx` · `FreeSessionLog.tsx` ·
`sessions/session-status-meta.ts`
---

## Amendement — 2026-08-20 (TLX-253) : la suppression d'une séance libre, pour de vrai

**§5 décrivait un chemin qui n'existe pas.** Il annonçait « soft-delete de l'affectation/séance
(**chemins existants**, propriétaire = l'athlète) », en supposant que le chemin coach servirait
l'athlète puisqu'il est propriétaire. Il ne le sert pas : `DELETE /sessions/{id}` est
`@Roles('coach')`, donc l'athlète est **refusé sur le rôle, avant même** tout contrôle de propriété.

Mesuré en QA-03.8/QA-03.10 sur l'athlète propriétaire de la séance :

```
GET    /sessions/92411c0b-…  →  200   {"status":"self_logged","coachId":"ae451bdf-…"}
DELETE /sessions/92411c0b-…  →  403   {"error":"FORBIDDEN","message":"Rôle insuffisant…"}
```

Il lit sa séance, il ne peut pas la supprimer. Une séance consignée par erreur — mauvaise date,
doublon, mauvaise épreuve — **ne peut plus jamais être retirée** et continue d'alimenter
progression, records et assiduité. La capacité a été spécifiée, jamais livrée, et **rien ne l'a
signalé** : le seul test qui l'aurait attrapée est celui d'un athlète supprimant sa propre séance,
que personne n'avait écrit.

### B1 — Endpoint athlète dédié `DELETE /athletes/me/training-log/{assignmentId}`

Retenu **contre** l'assouplissement du garde de `DELETE /sessions/{id}` (autoriser le rôle athlète
*si* `status === 'self_logged'` **et** `coachId === userId`). Moins de code, mais cela mettrait
**deux régimes d'autorisation dans une même route** — celle-là même dont le garde de rôle est
aujourd'hui la seule protection. Un endpoint dédié garde un régime par route, et c'est l'argument
qu'ADR-36 §2 avait **déjà retenu** pour la création, contre l'extension de `/sessions`. La
suppression est donc symétrique du `POST` qui a créé la séance.

**Le paramètre est l'`assignmentId`**, pas le `sessionId` : c'est l'identifiant que l'athlète
manipule partout (`GET /assignments`, route `/(athlete)/session/[id]`), et la séance libre est en
1:1 avec son affectation. Le serveur remonte à la séance.

**Garde** : rôle `athlete` **et** propriété — l'affectation est la sienne, sa séance est
`self_logged`, et `session.coachId === athleteId`. Tout écart donne **404** (pas 403) :
indistinguable de « n'existe pas », anti-énumération, cohérent avec `listTeammates` (ADR-37 §1).
Un athlète ne peut donc supprimer ni la séance d'un coach, ni celle d'un autre athlète.

### B2 — Soft-delete cohérent des trois maillons

La séance, l'affectation et la performance ont été créées **atomiquement** (§1) : elles disparaissent
ensemble, dans une transaction. `deletedAt` est posé sur la **séance** et sur l'**affectation** —
c'est suffisant et c'est déjà la maille que lit l'aval : `AthleteProgressService.derive` filtre
`deletedAt: null` **et** `session: { deletedAt: null }`. La progression, l'assiduité et la dérivation
de candidats cessent donc de voir la séance sans qu'une seule dérivation change.

`Performance` **ne porte pas de colonne `deleted_at`** et n'en gagne pas : elle n'est jamais lue
autrement que par son affectation (1:1, `assignment_id` unique). La conserver garde la trace
d'audit (ADR-33) sans la rendre visible nulle part.

### B3 — Le record confirmé issu de la perf supprimée est supprimé avec elle

C'est le point que le ticket demandait de trancher. `personal_records` est une table
**matérialisée**, pas une dérivation : `listMyRecords` fait un `findMany({ athleteId })` direct. Un
soft-delete ne la traverse donc pas — et l'`ON DELETE SET NULL` de `performance_id` ne se déclenche
que sur une suppression **physique**. Sans geste explicite, le record survivrait à la séance qui
l'a produit, `performance_id` pointant vers une ligne devenue invisible : **un record orphelin,
indiscernable d'un record manuel** (ADR-32).

**Décision : le record dont `performance_id` désigne la performance supprimée est supprimé**, dans
la même transaction. La séance n'a pas eu lieu, la marque n'a pas eu lieu, le record non plus. Un
record pointant vers une **autre** performance n'est pas touché.

**Aucun recalcul du record précédent.** Un record est **revendiqué**, pas agrégé (ADR-20/32 : la
détection propose des *candidats*, l'athlète confirme). Re-dériver la meilleure marque restante
reviendrait à inscrire au nom de l'athlète un record qu'il n'a jamais confirmé. Ses marques
antérieures restent en base et ressortiront comme candidats à la prochaine occasion.

### B4 — Côté écran : confirmation inline, pas de troisième geste destructif mal cadré

TLX-245 (confirmation restée armée visant la séance suivante) et TLX-250 (photo supprimée sans
confirmation, sous un « Annuler ») disent que les gestes destructifs de ce produit sont mal cadrés.
La suppression est donc posée sur le détail d'une séance libre **derrière la confirmation inline
d'ADR-44 §6** — le patron déjà utilisé pour quitter un groupe — et l'état de confirmation est
**dérivé de la ressource affichée**, jamais conservé d'un écran à l'autre (leçon de TLX-245,
appliquée par ADR-58).

**Réf. de l'amendement :** Linear TLX-253 · TLX-245 / TLX-250 (cadrage des gestes destructifs) ·
ADR-20/32 (record revendiqué) · ADR-33 (correction tracée) · ADR-44 §6 (confirmation inline) ·
scénarios QA-03.8 / QA-03.10
