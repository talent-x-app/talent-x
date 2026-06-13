## ADR-35 — Récurrence d'assignation : occurrences datées matérialisées (complément ADR-30/31)

- **Statut :** Accepté (validé 2026-06-13) — **implémentation à suivre** (TLX-127, non démarrée)
- **Date :** 2026-06-13
- **Décisions validées :** (1) **matérialisation à la création** (vs règle évaluée à la lecture — déjà tranché contre par ADR-30 Option C) ; (2) modèle d'occurrence = **duplication de séance par date** (**Option A** retenue, vs Option B « séance unique + index relâché » écartée) ; (3) cadence MVP = **hebdomadaire** jusqu'à une date de fin, bornée (52).
- **Réf. :** Linear TLX-127 · ADR-30 §4 (récurrence sortie du périmètre — « génération d'occurrences datées, une séance/affectation par date ») · ADR-30 §1 (la maille `SessionAssignment` par athlète est la vérité d'exécution, **inchangée**) · ADR-31 (cycle de vie des affectations) · `assignments.service.ts` (`assignSession`, `ux_assignment_active`) · `sessions.service.ts` (`duplicateSession`) · TLX-126 (programmes — absorbe la récurrence)

**Contexte.** Un coach de club veut « répéter cette séance **chaque mardi jusqu'au …** » en un geste,
plutôt que de ré-assigner manuellement chaque semaine. ADR-30 a **explicitement sorti** la récurrence
de son périmètre (§4) : c'est de la **génération d'occurrences datées**, orthogonale à la cible
(athlète/groupe), à traiter séparément (et brique des programmes TLX-126).

**Contrainte structurante.** L'aval est indexé sur `SessionAssignment.id` et l'idempotence repose sur
l'index unique partiel **`ux_assignment_active (session_id, athlete_id) WHERE deleted_at IS NULL`** :
il ne peut exister **qu'une** affectation active d'une **même séance** à un **même athlète**. Répéter
la *même* séance à 8 dates pour le même athlète **viole frontalement cet index**. ADR-30 a fait de la
non-altération de cette maille un **invariant** (rejet des options qui touchent le modèle/idempotence).
Il faut donc trancher *comment* représenter des occurrences répétées sans casser cet invariant — d'où
cet ADR (CLAUDE.md §7).

**Décision.**

### 1. Matérialisation à la création (pas de règle paresseuse)

Les occurrences sont **matérialisées à l'assignation** (écriture immédiate des `SessionAssignment`
datées), pas dérivées d'une « règle de récurrence » évaluée à la lecture. ADR-30 a déjà rejeté la
matérialisation paresseuse (Option C : écritures sur des `GET`, idempotence/concurrence fragiles). Une
règle stockée imposerait de ré-écrire dashboard (`today`/`overdue`), calendrier, désassignation et
records pour qu'ils « comprennent » des affectations virtuelles — coût disproportionné. Des occurrences
réelles **fonctionnent partout sans aucune modification de l'aval**.

### 2. Modèle d'occurrence = **duplication de séance par date** (Option A)

Chaque occurrence est une **séance dupliquée** assignée à sa date :

- occurrence **1** = la séance **originale** à `dueDate` (chemin d'assignation actuel, inchangé) ;
- occurrences **2..N** = une **copie serveur** de la séance (contenu identique : titre, description,
  statut, `exercises`, `brief`) assignée à sa date.

Pour chaque occurrence, on réutilise **tel quel** le fan-out d'ADR-30 (résolution athlètes + groupes,
ownership, `group_assignments` + provenance, réconciliation d'adhésion/sortie). **Aucun index, aucune
table, aucune idempotence ne change** : chaque occurrence est une séance distincte → l'unicité
`(session, athlete)` est respectée occurrence par occurrence, et toute la machinerie ADR-30/31 compose
sans rework. C'est exactement « une séance/affectation par date » (ADR-30 §4) et la **brique des
programmes** (TLX-126 : un programme = séquence de séances datées).

Choisi **contre l'Option B** (séance **unique** + N affectations datées en relâchant
`ux_assignment_active` vers `(session, athlete, due_date)`) : séduisante (une seule séance, édition/
calendrier « par série »), mais elle **touche l'index porteur** de l'idempotence qu'ADR-30 a fait
invariant, exige de gérer l'unicité sur une colonne **nullable** (`COALESCE(due_date, sentinel)`),
**modifie la sémantique d'idempotence existante** (ré-assigner la même séance à une date différente
crée désormais une 2ᵉ ligne) et impose le **même relâchement sur `ux_group_assignment_active`**. Plus
de risque sur le cœur, pour un gain (édition/désassignation « par série ») qui relève de toute façon
des **programmes** (TLX-126). Rejetée comme cible MVP.

### 3. Contrat — additif sur `AssignRequest`, cadence hebdomadaire bornée

```
AssignRequest += recurrence?: {
  frequency: 'weekly',   // seule valeur au MVP (enum extensible : biweekly… plus tard)
  until: date            // dernière occurrence possible (incluse)
}
```

- **`dueDate` requis** dès qu'une `recurrence` est fournie (première occurrence + jour de semaine
  implicite) → 422 `RECURRENCE_REQUIRES_DUE_DATE` sinon.
- `until ≥ dueDate` → 422 `INVALID_RECURRENCE` sinon. Occurrences = `dueDate`, `+7 j`, `+14 j`, … tant
  que `≤ until` (même jour de semaine que `dueDate`).
- **Borne dure** : au plus **`RECURRENCE_MAX_OCCURRENCES = 52`** (un an) → 422 `RECURRENCE_TOO_LONG`
  au-delà (pas de troncature silencieuse). Récurrence sans `dueDate`/sans `recurrence` = comportement
  actuel, **rétro-compatible**.

OpenAPI (`AssignRequest`, `RecurrenceRule`) → DTO Nest → client orval régénéré.

### 4. Notifications — une seule par athlète pour la série

Pour éviter N pushs (8 semaines = 8 notifications), `session_assigned` est émis **une fois par athlète
nouvellement affecté** sur l'ensemble de la série (occurrence 1), pas par occurrence (ADR-22). Le reste
de la sémantique de notification est inchangé.

### 5. Désassignation & bulk — par occurrence (série-wide → TLX-126)

Chaque occurrence est une affectation/séance **indépendante** : désassignation par les endpoints
existants (`DELETE /assignments/{id}`, `DELETE /sessions/{id}/assign/groups/{groupId}` par occurrence).
La gestion **« toute la série »** (annuler/éditer toutes les occurrences futures en un geste) relève
des **programmes** (TLX-126) — **hors périmètre** ici, explicitement (pas de table `series`, pas de
colonne de liaison au MVP : YAGNI tant que TLX-126 ne fixe pas le modèle de programme).

### 6. Accès, RGPD, cycle de vie — inchangés

Mêmes portes qu'aujourd'hui (coach propriétaire, athlètes liés, groupes possédés). Les occurrences sont
des séances/affectations ordinaires → dashboard, calendrier, assiduité (ADR-31), records, export/
effacement RGPD opèrent **sans modification**.

**Conséquences.**

- **+** Valeur cœur (« répéter chaque mardi jusqu'au… ») livrée en réutilisant **toute** la machinerie
  ADR-30/31 ; **zéro changement d'index, de table, d'idempotence** ; calendrier montre naturellement
  chaque occurrence à sa date ; brique directe des programmes (TLX-126) ; rétro-compatible.
- **À assumer :** N séances dupliquées par récurrence (proliferation de lignes `sessions` — acceptable,
  le calendrier les veut datées ; pas de liste « à plat » qui s'encombre au MVP) ; occurrences
  **indépendantes** → pas de gestion « par série » (édition/annulation groupée) au MVP → **TLX-126** ;
  écriture O(occurrences × cibles) à la création (bornée à 52 × membres, transaction).
- **Écartées :** (a) **règle paresseuse** évaluée à la lecture (ADR-30 Option C — fragile) ; (b)
  **Option B** séance unique + index relâché (touche le cœur protégé par ADR-30, sémantique d'idempotence
  modifiée, unicité sur colonne nullable) ; (c) **table `recurrence_rules`/`series`** au MVP — prématurée,
  recouvre les programmes (TLX-126) ; (d) cadences riches (quotidien, jours multiples, mensuel) — hebdo
  couvre le besoin cité ; enum extensible plus tard.

**Périmètre de livraison (après acceptation).** Module pur `assignments/recurrence.ts`
(`occurrenceDates(dueDate, until, max)` — génération + bornes, testable) → contrat (`AssignRequest.recurrence`,
`RecurrenceRule`) + DTO/orval → `AssignmentsService` (génération d'occurrences : occ.1 = originale,
occ.2..N = duplication serveur + fan-out par date, notif unique/athlète, 422 bornes) → tests (module pur,
service : occurrences, dédup notif, 422 ; intégration DB-backed : « chaque mardi » → N séances datées,
chaque athlète voit N affectations) → UI `CoachAssignScreen` (bloc « Répéter chaque <jour> jusqu'au <date> »
+ envoi `recurrence`) + tests.
