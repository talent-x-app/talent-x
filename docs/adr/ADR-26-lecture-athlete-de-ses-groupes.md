## ADR-26 — Lecture athlète de ses groupes & de son coach (`GET /groups/mine`)

- **Statut :** Accepté (validé 2026-06-10)
- **Date :** 2026-06-10
- **Réf. :** TLX-88 (« Écran athlète — rejoindre un groupe via code ») · TLX-87 · TX-SPEC-002 §6 (autorisation) · TX-DATA-006 §5.1 (groupes) · `talent-x-openapi.yaml` · ADR-08 (autorisation) · ADR-16 (révocation du code) · TLX-041 (backend groupes livré)

**Contexte.** TLX-88 demande, côté athlète, une section « Mon groupe / Mon coach » dans le Profil
et une action « Quitter le groupe ». Or le backend groupes livré par TLX-041 n'expose **aucune
lecture côté athlète** : `GET /groups`, `GET /groups/{id}` et `GET /groups/{id}/members` sont tous
`@Roles('coach')` (matrice TX-SPEC-002 §6 : `groups.*` hors join/leave = coach propriétaire).
L'athlète ne dispose que de `POST /groups/join` et `POST /groups/{id}/leave`. La réponse de `join`
(`GroupMember` = `{ athleteId, groupId, joinedAt, athlete? }`) **ne porte ni le nom du groupe ni le
coach**, et n'est de toute façon pas rejouable à l'ouverture de l'app. `GET /users/me` ne porte pas
non plus de `coachId`. **Conséquence :** l'athlète ne peut ni afficher son rattachement, ni connaître
de façon fiable le `groupId` à quitter. Combler ce manque suppose un **nouveau chemin de contrat** —
décision structurante que les specs ne tranchent pas (CLAUDE.md §7) → ADR avant code.

**Décision.**

### 1. Endpoint additif `GET /groups/mine` (athlète)

Ajouter un seul chemin **role-aware athlète** qui renvoie les groupes **actifs** de l'athlète
courant (un athlète peut appartenir à plusieurs groupes / avoir plusieurs coachs, ADR-08), chacun
enrichi du **résumé de son coach** et de la date d'adhésion :

- `GET /groups/mine` — `@Roles('athlete')` → 200, schéma `AthleteGroupList`.
- Filtre : `group_members` de l'athlète avec `left_at IS NULL` **et** `group.deleted_at IS NULL`,
  triés par `joined_at` ascendant.
- **Pas de pagination** : ensemble borné (quelques groupes au plus) → enveloppe simple `{ data }`
  (cohérente avec le reste mais sans `meta`, comme les listes bornées).

### 2. Schémas additifs OpenAPI

**`AthleteGroup`** — vue athlète d'un de ses groupes (≠ `Group` coach) :

| Champ | Type | Notes |
| --- | --- | --- |
| `id` | uuid | id du groupe |
| `name` | string | nom du groupe |
| `description` | string? | |
| `memberCount` | integer | membres actifs |
| `joinedAt` | date-time | adhésion de l'athlète |
| `coach` | `UserSummary` | « Mon coach » (id, prénom, nom, sport) |

**`AthleteGroupList`** = `{ data: AthleteGroup[] }`.

**Exclusion délibérée du `inviteCode`** : le code reste réservé au coach propriétaire (ADR-16). La
vue athlète ne l'expose **jamais** — elle ne réutilise donc pas `Group` (qui le porte) mais un
schéma dédié `AthleteGroup`.

### 3. Autorisation (matrice TX-SPEC-002 §6)

Nouvelle ligne : `groups.mine` → **rôle athlète**, portée = **soi-même** (les lignes
`group_members` de l'appelant). Aucune porte de consentement : l'appartenance à un groupe est une
**donnée de rattachement/planification, pas de santé** (cohérent avec ADR-24 ; les performances
restent gardées séparément). Le coach renvoyé est, par construction, le coach du groupe que
l'athlète a **lui-même** rejoint → pas de fuite de tiers.

### 4. Placement & implémentation

- Chemin dans le **`GroupsController` existant**, déclaré **avant** `@Get(':id')` (sinon « mine »
  est happé par la route paramétrée). Méthode service `listMyGroups(athleteId)` (jointure
  `group_member → group → coach`, `_count.members` actifs). DTO `AthleteGroupDto` / `AthleteGroupListDto`.
- Client orval régénéré ; le front (TLX-88) consomme `getMyGroups()` pour la section Profil et en
  dérive le `groupId` de l'action « Quitter ».

**Conséquences.**

- Positives : débloque TLX-88 (affichage « Mon groupe / Mon coach » + Quitter fiable) ; **additif**
  et rétro-compatible (aucun chemin/schéma existant modifié) ; pas de fuite du code d'invitation
  (schéma dédié) ; symétrique du `GET /competitions` role-aware (ADR-24) ; dérivation à la lecture,
  **zéro migration**.
- Négatives : une surface API + un schéma de plus à tester ; redondance partielle assumée entre
  `Group` (coach) et `AthleteGroup` (athlète) — choix volontaire pour ne pas exposer `inviteCode`.

**Alternatives considérées.**

- **Élargir `GET /groups` au rôle athlète** (role-aware comme `/competitions`) : rejeté — `Group`
  porte `inviteCode` (ADR-16) ; le rendre role-aware obligerait à masquer le champ selon l'appelant
  sur un schéma partagé (fragile) ; un schéma dédié `AthleteGroup` est plus sûr et plus lisible.
- **Renvoyer le rattachement via `GET /users/me`** (ajout `coach`/`group`) : rejeté — surcharge le
  profil d'une préoccoupation « groupes », casse la cohésion du schéma `User`, et gère mal le
  multi-groupes.
- **Front-only : persister le `GroupMember` du `join` localement** : rejeté (option écartée par le
  porteur) — perdu à la réinstallation, pas de nom de coach, incohérent à froid.
- **Pagination `{ data, meta }`** : écartée — ensemble borné ; la simplicité prime, élargissable
  plus tard sans rupture (ajout additif de `meta`).
