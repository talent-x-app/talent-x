## ADR-37 — Lecture athlète des coéquipiers de son groupe (`GET /groups/{id}/teammates`)

- **Statut :** Accepté (2026-06-15)
- **Date :** 2026-06-14 (proposé) · 2026-06-15 (accepté & implémenté)
- **Réf. :** Audit UX écran de séance / section « Mon groupe » (athlète) · ADR-26 (lecture athlète de ses groupes — **complète**) · ADR-08 (autorisation : rôle + appartenance) · ADR-16 (code d'invitation réservé au coach) · ADR-24/26 (classification : rattachement = donnée d'identification/planification, **pas** de santé) · TX-SPEC-002 §6 (matrice d'autorisation) · TX-DATA-006 §5.1 (groupes / `group_members`) · TX-SEC-003 (RGPD) · TX-DPIA-007 (AIPD) · `talent-x-openapi.yaml` · TLX-88

**Contexte.** ADR-26 a doté l'athlète de `GET /groups/mine` (ses groupes actifs, enrichis du coach et d'un **effectif** `memberCount`), consommé par la section « Mon groupe » du Profil (`MyGroupSection`). Mais cet ADR a **délibérément exclu la liste des membres** : `AthleteGroup` ne porte qu'un compteur, et l'unique endpoint qui matérialise la composition d'un groupe — `GET /groups/{id}/members` — est `@Roles('coach')` (propriétaire), renvoyant un `GroupMember` riche (`{ athleteId, groupId, joinedAt, athlete: UserSummary }`). **Conséquence :** un athlète voit *qu'il y a* 8 membres, mais **pas qui** ; il ne peut pas identifier ses coéquipiers. L'audit UX a relevé ce manque (« voir le détail de mon groupe »). Combler ce besoin suppose d'**exposer l'identité d'autres athlètes à un pair** : c'est une décision **structurante d'autorisation et de RGPD** que ni les specs ni ADR-26 ne tranchent (CLAUDE.md §7) → ADR avant code.

**Décision.**

### 1. Endpoint additif `GET /groups/{id}/teammates` (athlète, membre-gated)

Ajouter un chemin **role-aware athlète** renvoyant les **membres actifs** d'un groupe **dont l'appelant est lui-même membre actif** :

- `GET /groups/{id}/teammates` — `@Roles('athlete')` → 200, schéma `GroupTeammateList`.
- **Garde d'appartenance** (et non d'ownership) : l'appelant doit avoir une ligne `group_members` sur `{id}` avec `left_at IS NULL` **et** `group.deleted_at IS NULL` ; sinon **404** (ne pas distinguer « groupe inexistant » de « tu n'en es pas membre » — anti-énumération, cohérent avec le reste de l'API).
- Roster = membres **actifs uniquement** (`left_at IS NULL`), triés par `joined_at` ascendant. L'appelant **figure** dans la liste (l'UI peut le marquer « toi ») — pas de cas particulier serveur.
- **Pas de pagination** : ensemble borné (taille d'un groupe d'entraînement) → enveloppe simple `{ data }`, comme `GET /groups/mine`.

### 2. Schéma additif OpenAPI `GroupTeammate` (minimisé)

Vue **pair-à-pair** d'un membre — strictement minimisée (≠ `GroupMember` coach, ≠ `UserSummary`) :

| Champ | Type | Notes |
| --- | --- | --- |
| `id` | uuid | id de l'athlète |
| `firstName` | string? | |
| `lastName` | string? | |
| `avatarUrl` | string? | si le modèle `User` le porte (cf. TLX-134) ; sinon retiré |

**`GroupTeammateList`** = `{ data: GroupTeammate[] }`.

**Exclusions délibérées (minimisation RGPD) :** aucun e‑mail, aucune donnée de **performance / charge / santé** (elles restent gardées par consentement et **coach-scopées**, ADR-08/21), pas de `joinedAt` (sans valeur pour un pair). On **ne réutilise pas** `UserSummary` (qui porte `sport` et pourrait gagner des champs) ni `GroupMember` : un schéma dédié borne ce qui fuit vers un pair, exactement comme ADR-26 a préféré `AthleteGroup` à `Group` pour protéger `inviteCode`.

### 3. Autorisation (matrice TX-SPEC-002 §6)

Nouvelle ligne : `groups.teammates` → **rôle athlète**, portée = **membre actif** du groupe ciblé (pas d'ownership). **Aucune porte de consentement** : la composition d'un groupe est une donnée de **rattachement/identification**, pas de santé (cohérent avec ADR-24 et ADR-26). Le périmètre visible est borné aux **co-membres d'un groupe que l'athlète a lui-même rejoint** → pas de fuite de tiers hors de ce cercle.

### 4. RGPD / AIPD (point dur)

Cette décision introduit une **visibilité d'identité pair-à-pair** nouvelle (un athlète voit les noms d'autres athlètes). Avant implémentation :

- **Base & information** : la visibilité au sein d'un groupe d'entraînement relève de l'attente raisonnable d'un « trombinoscope d'équipe » ; elle doit néanmoins être **mentionnée dans la notice de confidentialité** et **tracée dans TX-DPIA-007** (nouveau flux de partage entre utilisateurs).
- **Minimisation** : nom + avatar seulement (cf. §2).
- **Intégrité** : exclure systématiquement les membres `left_at` non nul, les groupes supprimés (`deleted_at`) et les comptes effacés/anonymisés (ADR-15) — l'anonymisation doit se refléter dans ce roster.

### 5. Placement & implémentation

- Chemin dans le **`GroupsController` existant**, après `@Get(':id/members')` (segment littéral `teammates` → pas de collision avec `:id`). Méthode service `listTeammates(athleteId, groupId)` : vérifie l'appartenance active de l'appelant, puis jointure `group_member → athlete` filtrée `left_at IS NULL`. DTO `GroupTeammateDto` / `GroupTeammateListDto`.
- Client orval régénéré → `getGroupTeammates(id)`.
- **Front (hors ADR, sous ADR-26)** : rendre `MyGroupCard` ouvrable vers un écran **`app/(athlete)/group/[id].tsx`** qui affiche la `description` (déjà au contrat `AthleteGroup`, aujourd'hui non rendue), l'effectif, le coach, le **roster** (ce nouvel endpoint) et l'action « Quitter ».

**Conséquences.**

- Positives : donne à l'athlète le **sentiment d'équipe** et le contexte social attendu ; **additif** et rétro-compatible (aucun chemin/schéma existant modifié) ; schéma minimisé dédié (pas de fuite de `UserSummary`/`inviteCode`) ; réutilise le motif **membre-gated** ; symétrique de la vue coach des membres, mais bornée.
- Négatives : une surface API + un schéma de plus à tester ; **introduit un partage d'identité entre utilisateurs** → impose une mise à jour de la notice de confidentialité et une revue AIPD (assumé, pas silencieux) ; vigilance permanente pour ne pas laisser fuiter membres partis / comptes anonymisés.

**Alternatives considérées.**

- **Élargir `GET /groups/{id}/members` au rôle athlète** (role-aware sur `GroupMember`/`UserSummary` partagés) : rejeté — schéma partagé fragile (même raison qu'ADR-26 refusant d'élargir `GET /groups`), `UserSummary` peut gagner des champs, pagination orientée coach ; un schéma dédié minimisé est plus sûr.
- **Embarquer `teammates[]` dans `GET /groups/mine`** : rejeté — alourdit la charge et provoque un N+1, alors que le roster n'est pas toujours nécessaire ; garder le `memberCount` en résumé et charger le roster **à la demande**.
- **Exposer des profils plus riches au pair** (sport, records, charge) : rejeté — minimisation RGPD ; performance/santé reste **consent-gated** et **coach-scopée** (ADR-08/21).
- **Statu quo (effectif seul, ADR-26)** : rejeté ici au regard du besoin produit, mais reste le **repli** si la revue AIPD bloque la visibilité pair-à-pair.

**Décisions sur les questions ouvertes (tranchées à l'implémentation, 2026-06-15).**

1. **`sport` exclu de la v1** : minimisation — un pair n'a besoin que de l'identité (nom + avatar). Réintroductible ultérieurement si un besoin « groupe multi-disciplines » émerge.
2. **`avatarUrl` inclus** : le modèle `User` porte bien `photo_url` (avatar TLX-124, clé objet présignée en lecture). Le roster présigne chaque avatar **best-effort** (TTL `AVATAR_URL_TTL_SECONDS`, défaut 3600 s) ; en cas d'échec de présignature (stockage non configuré en dev/test), le champ est **omis** et le client retombe sur les initiales.
3. **TX-DPIA-007 / notice de confidentialité → suivi non-code** : le livrable est **additif et minimisé** (identité seule, membre-gated, périmètre borné au groupe rejoint), mais la **visibilité d'identité pair-à-pair** reste à tracer dans l'AIPD et à mentionner dans la notice **avant la mise en production** de la fonctionnalité (ne se code pas ; à acter côté conformité).

**Implémentation (2026-06-15).** `GET /groups/{id}/teammates` (`@Roles('athlete')`, membre-gated → 404 anti-énumération) ; schémas `GroupTeammate`/`GroupTeammateList` au contrat → DTO → client orval régénéré ; `GroupsService.listTeammates` (présignature avatar via `StorageModule`). Front : écran `app/(athlete)/group/[id].tsx` (`AthleteGroupDetailScreen`) ouvert depuis `MyGroupCard`. Tests : API unit + intégration DB-backed, mobile RTL.
