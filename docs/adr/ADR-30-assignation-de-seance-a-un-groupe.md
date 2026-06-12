## ADR-30 — Assignation d'une séance à un groupe : fan-out à la maille athlète (+ entité de groupe pour la dynamique)

- **Statut :** Accepté (validé 2026-06-12)
- **Date :** 2026-06-12
- **Décisions produit validées :** (1) **Lots 1 et 2 livrés ensemble** (dynamique complète d'emblée, pas seulement le snapshot) ; (2) un athlète qui **rejoint** un groupe reçoit **uniquement les affectations à venir et non datées** du groupe, **jamais** les séances passées/en retard (cf. §3 Lot 2, défaut confirmé).
- **Réf. :** Linear TLX-109 (« Assignation par groupe + récurrence ») · TX-SPEC-002 §5 (modèle séances/affectations) · §6 (autorisation) · TX-DATA-006 §5 (affectations, groupes, `coach_athlete_links`) · `talent-x-openapi.yaml` (`AssignRequest`, `POST /sessions/{id}/assign`) · ADR-08 (RBAC + appartenance + ownership + consentement) · ADR-26 (groupes athlète) · ADR-29 (garde `template` non assignable) · ADR-22 (notifications) · TLX-051 (affectations livrées) · prépare TLX-126 (programmes multi-semaines)

**Contexte.** Aujourd'hui, le groupe ne sert **que de mécanisme de rattachement** : rejoindre un
groupe crée le lien `coach_athlete_links` (source `group`), point final. L'**assignation reste à la
maille athlète** : `AssignRequestDto` n'accepte qu'`athleteIds` (aucun `groupId`), l'écran coach
liste tous les athlètes liés **à plat** (pas par groupe), et le serveur crée **N affectations
individuelles** (`SessionAssignment` = `session × athlete`, idempotent par l'index unique partiel
`ux_assignment_active`). Conséquence : un coach ne peut pas « mettre une séance dans un groupe » en un
geste, et un athlète qui **rejoint le groupe ensuite** n'hérite d'aucune séance — l'affectation est un
instantané figé au clic.

Le besoin produit (TLX-109, quotidien d'un coach de club de 15+ athlètes) : **assigner au groupe**,
que **tous les membres voient la séance**, idéalement **y compris les nouveaux**.

Contrainte structurante à respecter. **Tout l'aval est indexé sur `SessionAssignment.id`** : la
performance est 1:1 avec l'affectation (`performances.assignment_id`), les dérivations de pilotage
(dashboard `toReview`/`today`/`overdue`, statut `completed`, A-06 progression, records ADR-20) lisent
les affectations. Une « affectation de groupe » qui n'existerait **qu'**au niveau groupe (sans ligne
par athlète) n'aurait **nulle part où accrocher une performance** et casserait tout l'analytique. La
maille `SessionAssignment` par athlète **doit donc rester la vérité d'exécution**, quelle que soit la
source de l'affectation (individuelle ou groupe). C'est une décision structurante que les specs ne
tranchent pas (CLAUDE.md §7) → ADR avant code.

**Décision.**

### 1. Le groupe est une *source* d'affectation, pas une nouvelle maille d'exécution

Assigner à un groupe **résout** vers ses membres actifs et **matérialise une `SessionAssignment` par
athlète** — la maille d'exécution est inchangée. La performance, le statut, le dashboard, les records
continuent d'opérer sur des affectations individuelles réelles, **sans aucune modification de leur
modèle**. C'est l'invariant central de cet ADR.

### 2. Contrat — additif, `groupIds` à côté d'`athleteIds`

`AssignRequest` (OpenAPI → DTO Nest → client orval) gagne `groupIds?: string[]` :

```
AssignRequest = { athleteIds?: uuid[], groupIds?: uuid[], dueDate?: date }
  invariant : au moins l'un de (athleteIds, groupIds) non vide → 422 sinon.
```

Côté serveur (`AssignmentsService.assignSession`) : ownership de la séance (existant) + **ownership de
chaque groupe** (`assertGroupOwnedByCoach`, ADR-26) ; résolution des `groupIds` en `athleteIds` des
**membres actifs** (`group_members` `left_at IS NULL`) ; **union dédupliquée** avec les `athleteIds`
explicites ; puis le fan-out idempotent **actuel, inchangé**. Rétro-compatible : `athleteIds` seul =
comportement d'aujourd'hui.

Garde-fous réutilisés tels quels : `template` non assignable (ADR-29, 422 `SESSION_NOT_ASSIGNABLE`) ;
lien coach↔athlète (un membre actif est lié par construction) ; idempotence par couple
(`session_id, athlete_id`) — un athlète membre **et** déjà assigné individuellement ne crée jamais de
doublon ; notification `session_assigned` émise **uniquement** sur les affectations nouvellement créées
(ADR-22). Groupe vide / tous déjà assignés → **200** avec la liste (éventuellement vide), pas d'erreur.

### 3. Deux lots — snapshot d'abord, dynamique ensuite

L'auto-inclusion des **futurs** membres impose de **tracer la provenance « groupe »** et de
**réconcilier** sur les changements d'appartenance. C'est séparable de la convenance « assigner au
groupe », qui apporte déjà 80 % de la valeur. D'où deux lots (méthode ADR-18→19/27) :

**Lot 1 — Fan-out snapshot (zéro table, zéro migration).** `groupIds` au contrat + résolution +
union + fan-out idempotent (§2). UI coach : sélection **par groupe** dans `CoachAssignScreen`
(« tout le groupe » / dépliage des membres) au lieu de la liste plate. Couvre : « assigner au groupe
en un geste » et « tous les membres **actuels** voient la séance ». **Ne couvre pas** les futurs
membres (instantané). Livrable rapidement, sans risque sur l'aval.

**Lot 2 — Entité d'affectation de groupe + réconciliation (dynamique).**
- Table **`group_assignments`** (`id`, `session_id`, `group_id`, `due_date`, `created_at`,
  `deleted_at`) = « cette séance est affectée à ce groupe » (l'**intention**, durable). Migration
  expand-only.
- Colonne nullable **`group_assignment_id`** sur `session_assignments` = **provenance** (l'affectation
  individuelle vient d'une affectation de groupe). Permet le désassignement **en masse** et la
  réconciliation. Les affectations individuelles gardent `group_assignment_id = null`.
- **Réconciliation à l'adhésion** (`joinGroup`) : matérialise les `SessionAssignment` du nouveau
  membre pour les `group_assignments` **non échues** du groupe (futures + non datées) — rejoindre un
  groupe ne déverse pas les séances **passées/en retard** sur le nouvel arrivant (défaut sensé,
  ré-ajustable).
- **À la sortie** (`leaveGroup` / `removeGroupMember`) : on **conserve** les affectations
  `completed`/`in_progress` (vérité historique, RB-06) ; on **soft-delete** les affectations
  `assigned` **futures** issues du groupe (`group_assignment_id` non nul, non commencées). Les
  affectations **individuelles** ne sont jamais touchées par un départ de groupe.
- **Désassigner le groupe** : soft-delete du `group_assignment` → soft-delete des `SessionAssignment`
  de provenance non commencées (mêmes règles que la sortie).

### 4. Récurrence — hors de cet ADR

« Répéter chaque mardi jusqu'au… » (aussi cité par TLX-109) est **orthogonal** : c'est de la
**génération d'occurrences datées** (une séance/affectation par date), indépendante de la cible
(athlète ou groupe). Traité séparément (et naturellement absorbé par les **programmes** TLX-126, dont
ce présent ADR est une brique : un programme = une séquence de séances datées assignées à un
athlète/groupe). Cet ADR se borne à la **cible groupe**.

### 5. Placement & implémentation

- **Backend Lot 1** : `groupIds` (`assign-request.dto.ts` + OpenAPI `AssignRequest`) ; résolution
  membres + union dans `assignSession` ; `assertGroupOwnedByCoach` par groupe ; tests unitaires
  (résolution, dédup individuel∩membre, garde `template`, groupe vide) + intégration (assign groupe →
  chaque membre a une affectation → chacun voit la séance via `GET /assignments`).
- **Front Lot 1** : `CoachAssignScreen` — sélection par groupe (toggle « tout le groupe », badge
  effectif) en plus de la sélection individuelle ; `groupIds` au payload ; clé d'idempotence dérivée
  de (séance + groupes triés + athlètes triés).
- **Backend Lot 2** : migration `group_assignments` + `session_assignments.group_assignment_id` ;
  réconciliation dans `GroupsService.joinGroup`/`leaveGroup`/`removeGroupMember` ; endpoint de
  désassignement de groupe ; tests (adhésion tardive → reçoit les futures, pas les passées ; départ →
  conserve l'historique, retire les futures).

**Conséquences.**

- Positives : **la maille d'exécution `SessionAssignment` ne bouge pas** → performance, dashboard,
  records, statut `completed` inchangés et non re-testés sur le fond. Lot 1 **additif** (un champ de
  contrat, zéro migration) livre la valeur cœur vite. Lot 2 ajoute la dynamique **sans rework** du
  Lot 1 (table + FK nullable). Idempotence par couple absorbe gratuitement le chevauchement
  individuel/groupe. Prépare directement les programmes (TLX-126).
- Négatives : deux représentations coexistent (affectation individuelle vs issue d'un groupe) — la
  provenance (`group_assignment_id`) doit être lue partout où l'on raisonne « désassigner / qui a
  reçu quoi ». La réconciliation à l'adhésion introduit une écriture dans `joinGroup` (transaction
  déjà présente). La politique « pas les séances passées au nouvel arrivant » est un choix par défaut
  à confirmer côté produit.

**Alternatives considérées.**

- **Option A — `groupIds` = pur sucre syntaxique, snapshot définitif (jamais de dynamique).** = Lot 1
  seul, sans entité de groupe. Rejeté **comme cible finale** (ne répond pas à « les nouveaux membres
  voient la séance »), mais **retenu comme Lot 1** car il livre 80 % de la valeur sans risque et
  ouvre proprement le Lot 2.
- **Option B — affectation purement au niveau groupe (pas de ligne par athlète), vue athlète =
  union (mes affectations) ∪ (séances des groupes dont je suis membre).** Rejeté : casse la maille
  `SessionAssignment` — plus rien où accrocher une performance (1:1 avec l'affectation), réécriture de
  toute l'agrégation dashboard/records/`completed` et du modèle `performances`. Coût et risque
  disproportionnés pour le MVP.
- **Option C — matérialisation paresseuse à la lecture** (créer l'affectation du membre au premier
  `GET`). Rejeté : écritures sur des `GET` (idempotence/concurrence fragiles), effets de bord
  difficiles à raisonner ; la réconciliation **événementielle** (à l'adhésion/au départ, Lot 2) est
  plus simple et déterministe.
- **`groupId` unique plutôt que `groupIds[]`** : écarté — un coach peut assigner à plusieurs groupes
  en une fois (ex. « seniors + espoirs ») ; le tableau dédupe naturellement avec `athleteIds`.
