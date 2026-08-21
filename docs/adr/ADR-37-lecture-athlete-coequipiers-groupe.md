## ADR-37 — Lecture athlète des coéquipiers de son groupe (`GET /groups/{id}/teammates`)

- **Statut :** Accepté (2026-06-15) · **amendé le 2026-08-20** (TLX-252 — l'avatar traverse la relation coach ↔ athlète, voir *Amendement* en fin de document)
- **Date :** 2026-06-14 (proposé) · 2026-06-15 (accepté & implémenté) · 2026-08-20 (amendé)
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

---

## Amendement — 2026-08-20 (TLX-252) : l'avatar traverse aussi la relation coach ↔ athlète

**Ce que cet ADR avait couvert, et ce qu'il n'avait pas couvert.** §2 a introduit `avatarUrl` sur la
vue **pair-à-pair** `GroupTeammate`, et §4 a fait analyser cette visibilité d'identité en AIPD. La
relation **coach ↔ athlète** n'a jamais été examinée sous cet angle : `GroupMember.athlete` et
`AthleteGroup.coach` pointent tous deux sur `UserSummary`, qui **ne porte pas d'avatar**.

Le résultat, mesuré sur staging en QA-03.9 avec un athlète ayant une photo réelle : `GET /users/me`
renvoie bien une URL présignée, `GET /groups/{id}/members` côté coach n'en renvoie aucune, et les
écrans coach rendent des initiales, jamais une image. **Ce n'était pas un défaut, c'était le
contrat** — et il produisait une asymétrie cocasse une fois énoncée : *un athlète voit la photo de
ses coéquipiers, mais ni son coach ni lui-même ne se voient*.

**Demande produit du propriétaire (2026-08-20) :**

> On peut corriger l'ADR 37. Le coach doit pouvoir voir la photo de profil et inversement

### A1 — Décision : l'avatar traverse la relation coach ↔ athlète, dans les deux sens

La photo d'un athlète est visible de **ses** coachs ; la photo d'un coach est visible de **ses**
athlètes. Dans les deux sens : via une **URL présignée à TTL court**, avec **repli sur les
initiales** quand il n'y a pas de photo ou que le stockage est indisponible.

**Pourquoi la minimisation d'ADR-37 ne s'y oppose pas.** §2 bornait ce qui fuit vers un **pair** —
un athlète que rien n'autorise a priori à connaître les autres, d'où la revue AIPD. La relation
coach ↔ athlète est d'une **autre nature** : elle est déjà **consentie explicitement**
(`coach_access`, scopé par coach depuis ADR-51 §D2), déjà **matérialisée** par un lien
(`CoachAthleteLink`), et elle porte déjà des données **autrement plus sensibles** — performances,
charge d'entraînement, assiduité, RPE. Y ajouter une photo de profil **ne change pas la catégorie de
traitement** : c'est la donnée la moins sensible qui circule déjà sur ce canal.

**Ce qui ne traverse toujours pas.** L'amendement porte sur l'**avatar seul**. Restent exclus de ces
surfaces : l'**e-mail**, la **date de naissance**, et toute **donnée de santé**. La minimisation
reste la règle partout ailleurs — en particulier la vue **pair-à-pair** (§2) est **inchangée** : un
coéquipier ne gagne rien ici.

### A2 — Forme au contrat : un schéma présenté, pas un `UserSummary` élargi

Deux options étaient ouvertes : étendre `UserSummary` (porté par `GroupMember.athlete`,
`AthleteGroup.coach`, `Announcement.author`), ou introduire une **variante présentée**.

**Retenu : la variante présentée** — `LinkedUserSummary` = `UserSummary` + `avatarUrl?`, appliquée
**explicitement** à chaque surface qui doit exposer la photo. Élargir `UserSummary` aurait exposé
l'avatar **par effet de bord** partout où le schéma est réutilisé, présent et futur : la décision
d'exposition doit se lire à l'endroit où elle est prise, pas se déduire d'un schéma partagé. C'est
exactement l'argument qui a fait préférer `GroupTeammate` à `UserSummary` en §2, et `AthleteGroup` à
`Group` en ADR-26.

Surfaces retenues (et **seulement** celles-là) :

| Surface | Schéma | Sens |
| --- | --- | --- |
| `GET /groups/{id}/members` → `GroupMember.athlete` | `LinkedUserSummary` | coach voit l'athlète |
| `GET /coach/dashboard` → `DashboardAthlete` | `avatarUrl` additif | coach voit l'athlète |
| `GET /groups/mine` → `AthleteGroup.coach` | `LinkedUserSummary` | athlète voit son coach |

`Announcement.author` reste sur `UserSummary` **sans avatar** : rien ne le demande, et l'inclure
aurait été précisément l'effet de bord qu'on refuse.

### A3 — Présignature : un seul présentateur

`TeammatePresenter` (`storage/teammate-presenter.service.ts`) fait déjà ce travail — présignature
best-effort, TTL `AVATAR_URL_TTL_SECONDS`, avatar **omis** si le stockage est indisponible. Les
nouvelles surfaces le **réutilisent**.

Constat au passage : `GroupsService.listTeammates` portait une **copie inline** de cette logique
(`toTeammateDto`), écrite avant l'extraction du présentateur et jamais repliée dessus — deux
implémentations du même best-effort, dont une seule était testée comme telle. Elle est supprimée au
profit du présentateur.

### A4 — Non-fuite : la garde est celle qui existe déjà

Aucune porte d'autorisation neuve. Les trois surfaces sont **déjà** gardées :
`GET /groups/{id}/members` par l'ownership du groupe, `GET /coach/dashboard` par le scope coach,
`GET /groups/mine` par l'appartenance de l'athlète. **Un coach non lié n'atteint aucune de ces
routes**, donc ne récupère aucune URL — la propriété à tester est que l'avatar ne franchit pas une
porte, pas qu'une porte nouvelle le retienne.

### A5 — AIPD

§4 avait déclenché une revue AIPD pour la visibilité pair-à-pair. Le même réflexe s'applique :
le flux est consigné en **TX-DPIA-007 §5.8**, ne serait-ce que pour acter qu'il est **couvert par le
consentement existant** et qu'il n'ajoute aucune catégorie de donnée à un canal déjà analysé.

**Réf. de l'amendement :** Linear TLX-252 · scénario QA-03.9 · ADR-51 §D2 (consentement scopé par
coach) · `teammate-presenter.service.ts` · TX-DPIA-007 §5.8
