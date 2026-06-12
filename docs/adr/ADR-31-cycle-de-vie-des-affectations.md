## ADR-31 — Cycle de vie des affectations : transitions explicites (skip / in_progress), replanification et désassignation

- **Statut :** Accepté (validé 2026-06-12)
- **Date :** 2026-06-12
- **Décisions produit validées :** (1) `skipped` posable par l'**athlète** (« je ne peux pas » + motif) **et** le **coach** (« j'annule pour cet athlète »), réversible ; (2) `skipped` **exclu du dénominateur** du taux d'assiduité (ne pénalise pas l'athlète) ; (3) notification au coach sur indispo **hors périmètre** (le coach le voit au dashboard) ; (4) `DELETE` interdit sur une affectation **réalisée** (préserve la perf).
- **Réf. :** Linear TLX-108 · TX-SPEC-002 §5 (séances/affectations) · §6 (autorisation) · TX-DATA-006 §5 (`session_assignments`) · `talent-x-openapi.yaml` (`Assignment`, `AssignmentStatus`, `/assignments/{id}`) · ADR-08 (RBAC + appartenance + ownership + consentement) · ADR-17 (contrat dérivations dashboard/stats) · ADR-30 (provenance `group_assignment_id`) · ADR-22 (notifications) · TLX-051/070/080 (affectations, perf, dérivations livrées)

**Contexte.** L'enum `AssignmentStatus` compte quatre valeurs — `assigned`, `in_progress`,
`completed`, `skipped` — déclarées dans le DTO, le contrat OpenAPI **et** la contrainte `CHECK` en
base. Mais en pratique **seuls deux transitent** : `assigned` (défaut à la création) et `completed`
(posé à la soumission de perf, TLX-070). `in_progress` et `skipped` **ne sont jamais posés** : aucun
endpoint ne les écrit, et il n'existe ni `PATCH` ni `DELETE /assignments/{id}`.

Conséquences concrètes (quotidien d'un coach de club) :
- **Une séance ratée reste « en retard » à vie.** La dérivation dashboard `overdue` (et `missed` des
  stats) compte toute affectation `pending` (= `assigned`|`in_progress`) dont la `dueDate` est passée.
  Sans moyen de poser `skipped`, une absence/blessure pollue les alertes du coach **indéfiniment**,
  insoldable.
- **L'athlète ne peut pas signaler une indisponibilité** (blessure, absence, météo) : il n'a aucun
  geste « je ne peux pas faire cette séance ».
- **Le coach ne peut ni désassigner ni replanifier** une affectation individuelle : pas de `DELETE`
  (seule la désassignation **de groupe** existe, ADR-30), pas de moyen de déplacer une échéance.

C'est un trou de **cycle de vie**, structurant (le contrat bouge : nouveaux verbes, nouvelle colonne,
dérivations touchées) → ADR avant code (CLAUDE.md §7).

**Invariant à préserver.** `completed` est **terminal** et adossé à une `Performance` 1:1
(`performances.assignment_id`). Aucune transition de cet ADR ne doit pouvoir effacer une performance
ni rendre incohérent l'aval (records ADR-20, progression A-06, revue C-08). Les transitions ne
touchent donc **jamais** une affectation `completed`.

**Décision.**

### 1. Machine à états explicite, minimale et réversible

```
                 (perf soumise, TLX-070)
   assigned ───────────────────────────────▶ completed   (terminal)
      │  ▲                                        ▲
      │  │ un-skip                                │ (perf soumise)
      ▼  │                                        │
   skipped ◀───────────────── in_progress ────────┘
      ▲                            ▲
      └──── skip ─────────── assigned/in_progress
```

- `assigned → in_progress` : l'**athlète titulaire** démarre l'exécution (pose facultative ; la
  saisie de perf fait de toute façon basculer `completed`). `in_progress` reste « pending » pour les
  dérivations (une séance commencée mais non soumise et en retard **doit** rester un retard).
- `assigned|in_progress → skipped` : signaler une indispo / annuler (cf. §3 pour le RBAC). `skipped`
  **sort des « pending »** → disparaît des retards du dashboard et des « manquées » des stats.
- `skipped → assigned` : revenir en arrière (annuler le skip). Réactivation simple.
- `* → completed` : **uniquement** par la soumission de perf (inchangé). `PATCH status=completed` est
  refusé (`422 ASSIGNMENT_STATUS_TRANSITION`).
- Toute transition depuis `completed`, ou `skipped` posé sur une affectation qui porte déjà une perf,
  est refusée (`422`). On ne « saute » pas une séance réalisée.

### 2. Contrat — `PATCH` + `DELETE /assignments/{id}` (additif)

**`PATCH /assignments/{id}`** — mise à jour partielle, corps `AssignmentUpdateRequest` :

```
AssignmentUpdateRequest = {
  status?:  'in_progress' | 'skipped' | 'assigned',   // transitions §1 (jamais 'completed')
  dueDate?: date | null,                               // replanification ; null = retire l'échéance
  skipReason?: 'injury' | 'absence' | 'weather' | 'other'  // requis ssi status=skipped, sinon ignoré/effacé
}
  invariant : au moins un champ fourni → 422 sinon.
```

- Réponse **200** + l'`Assignment` à jour. `404` si introuvable / non autorisé. `422` sur transition
  illégale ou `dueDate` invalide.
- `dueDate` ne réécrit **que** `session_assignments.due_date` (pas le `group_assignment` d'origine —
  replanifier un membre est un **override individuel** ; la provenance `group_assignment_id` est
  conservée).

**`DELETE /assignments/{id}`** — désassignation **soft** (`deleted_at`), réservée au **coach
propriétaire**. Réponse **204** ; `404` si introuvable / non propriétaire ; **`422`
`ASSIGNMENT_COMPLETED`** si l'affectation est `completed` (préserve la performance — cf. §3 décision 4).
Le soft-delete libère l'index unique partiel `ux_assignment_active` → le coach peut réaffecter plus
tard. Détacher un membre d'une affectation de provenance groupe est permis (soft-delete de la
`SessionAssignment` seule ; la `group_assignment` reste intacte ; pas de re-matérialisation tant que
l'adhésion ne change pas).

OpenAPI → DTO Nest → client orval régénérés. Garde-fous réutilisés : ownership séance/affectation
(ADR-08), `404` vs `403` alignés sur l'existant (404 = introuvable/hors scope).

### 3. RBAC — qui pose quoi

| Action | Acteur autorisé |
|---|---|
| `PATCH dueDate` (replanifier) | **coach propriétaire** de la séance |
| `PATCH status=skipped` (+ motif) | **athlète titulaire** (« je ne peux pas ») **et** **coach propriétaire** (« j'annule pour lui ») |
| `PATCH status=in_progress` | **athlète titulaire** |
| `PATCH status=assigned` (un-skip) | athlète titulaire **ou** coach propriétaire |
| `DELETE` (désassigner) | **coach propriétaire** uniquement |

L'athlète ne peut jamais replanifier ni désassigner (c'est le coach qui pilote le planning) ; le coach
ne « commence » pas une séance à la place de l'athlète. Pas de porte de consentement ici (ni donnée de
santé ni accès coach : un changement de statut/échéance d'affectation n'expose aucune mesure).

### 4. Impact sur les dérivations (ADR-17)

- **Dashboard `overdue` / `missed`** : **aucun changement de code** — `pending` exclut déjà `skipped`
  et `completed`. Poser `skipped` résout mécaniquement l'« insoldable ». C'est précisément pourquoi la
  machine à états suffit.
- **Stats d'assiduité (`completionRate`)** : aujourd'hui `completed / total`. Une séance `skipped`
  pour blessure ne doit pas pénaliser l'assiduité → **on exclut `skipped` du dénominateur** :
  `completionRate = completed / (total − skipped)` (0 si dénominateur nul). On ajoute un compteur
  `skipped` à `StatsMetrics` (additif, ADR-17). `missed` exclut déjà `skipped`.
- **Calendrier coach (C-09) / listes** : `skipped` est un état d'affichage distinct (ni « à faire »,
  ni « en retard », ni « réalisée ») — purement frontend.

### 5. Modèle — une colonne, expand-only

`session_assignments` gagne `skip_reason TEXT NULL` (CHECK `injury|absence|weather|other`), renseignée
quand `status→skipped`, **remise à NULL** au retour `assigned`. Migration expand-only (ADR-12), aucune
donnée existante touchée. `Assignment` (DTO + OpenAPI) expose `skipReason?` (lisible par les deux
parties : le coach voit *pourquoi*). `in_progress`/`skipped` étant déjà dans le `CHECK` du statut,
**aucune migration de l'enum** n'est nécessaire.

### 6. Notifications — hors périmètre (décision 3)

Pas de nouveau type ADR-22 dans cet ADR. Le coach **voit** une indispo au dashboard/calendrier (statut
`skipped`), sans push. Une éventuelle notification `assignment_skipped → coach` (et `assignment_replanned
→ athlète`) est un **complément additif** à trancher plus tard (suivi dédié) — on évite d'élargir la
taxonomie de notification dans un ticket de cycle de vie.

**Conséquences.**

- **Positives :** le retard devient soldable (skip) ; l'athlète a une voix (« je ne peux pas » + motif) ;
  le coach pilote vraiment le planning (replanifier, désassigner). Dérivations dashboard **inchangées**
  (la machine à états suffit) ; assiduité plus juste. Additif et rétro-compatible : les affectations
  existantes restent `assigned`, le contrat ne casse rien.
- **À assumer :** une colonne `skip_reason` + une dérivation d'assiduité modifiée (dénominateur). Le
  `DELETE` introduit une désassignation individuelle (la désassignation de groupe ADR-30 reste le geste
  « en masse »). `in_progress` reste peu utilisé au MVP (pose facultative) — assumé, il prépare une
  saisie « démarrée » future sans nouveau contrat.
- **Écartées :** (a) un statut `cancelled` distinct de `skipped` — redondant au MVP (le motif porte la
  nuance) ; (b) replanification via une nouvelle ressource « occurrence » — surdimensionné (la
  récurrence est TLX-126/127) ; (c) hard-delete à la désassignation — casserait l'historique et l'index ;
  (d) notifications skip/replan — reportées pour ne pas élargir ADR-22.

**Périmètre de livraison (après acceptation).** Contrat (OpenAPI `PATCH`/`DELETE /assignments/{id}`,
`AssignmentUpdateRequest`, `skipReason`) → migration `skip_reason` → backend (`AssignmentsService.patch`
/ `remove`, machine à états + RBAC, dérivation assiduité) → tests unitaires + intégration → UI (coach :
replanifier / désassigner depuis le détail d'affectation et le calendrier ; athlète : « signaler une
indispo » + motif depuis le détail de séance).
