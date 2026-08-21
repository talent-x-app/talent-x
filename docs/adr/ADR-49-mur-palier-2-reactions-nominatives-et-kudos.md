## ADR-49 — Mur Palier 2 : exécution des réactions nominatives + kudos de participation

- **Statut :** Accepté (2026-06-23 — validé par le responsable de traitement ; périmètre Option A : réactions nominatives + kudos)
- **Date :** 2026-06-23
- **Réf. :** ADR-48 §Palier 2 (trajectoire & invariants) · ADR-37 (identité minimisée `GroupTeammate`, AIPD **validée** TLX-150) · ADR-43 §5 (visibilité pair-à-pair de la **présence** — différée à l'AIPD) · ADR-45 (patron d'agrégat) · ADR-22/23 (notifications) · ADR-08/21 (frontière santé/perf) · ADR-10 (notification générique `resourceId`) · TX-DPIA-007 §5.5 · `talent-x-openapi.yaml` · TLX-185.
- **Implémente :** ADR-48 Palier 2. Celui-ci **livre** (contrat, tables, gardes), conformément à « un ADR d'exécution par palier ».

**Contexte.** Le Palier 1 (ADR-48, TLX-184, livré) stocke déjà l'auteur de chaque réaction
(`announcement_reactions.user_id`) mais **ne ressort que des compteurs** (patron ADR-45). Le Palier 2
lève le voile d'anonymat sur **deux** surfaces : (a) **qui** a réagi à une annonce, (b) un **kudos**
d'encouragement entre coéquipiers sur une présence confirmée. La conformité du flux d'**identité**
pair-à-pair est acquise (TX-DPIA-007 §5.5, validée), mais le kudos introduit en plus une
**visibilité de présence** entre pairs, que ADR-43 §5 avait différée à l'AIPD **séparément** — point
dur ci-dessous (décision D3).

### D1 — Réactions nominatives : enrichir le contrat existant (pas de nouvel endpoint)

Les verbes Palier 1 (`PUT/DELETE …/reactions/{emoji}`) sont inchangés. On **enrichit la lecture** :
chaque entrée de `GroupAnnouncement.reactions[]` gagne, en plus de `count`, une liste **bornée** des
auteurs minimisés :

```
reactions: { emoji, count, reactors: GroupTeammate[] }[]   // reactors plafonné à REACTION_REACTORS_CAP (défaut 8)
```

- `GroupTeammate` = schéma **déjà existant** (ADR-37 : `id`, `firstName?`, `lastName?`, `avatarUrl?`),
  donc identité minimisée, zéro champ nouveau. Avatars présignés **best-effort** (réutilise le motif
  `StorageModule` d'ADR-37, TTL `AVATAR_URL_TTL_SECONDS`).
- **Plafond** `reactors` (défaut 8, via `.env`) → l'UI rend « ❤️ par Léa, Karim +6 » sans payload ni
  présignature non bornés. `count` reste l'agrégat exact.
- **Périmètre** : les `reactors` sont par construction des **co-membres actifs** du même groupe →
  strictement dans le cercle déjà validé (TX-DPIA-007 §5.5). Membres partis / anonymisés exclus
  (mêmes filtres `left_at`/`deleted_at` qu'ADR-37).
- `myReactions` (Palier 1) conservé (donnée propre de l'appelant).

### D2 — Kudos de participation : table + verbes dédiés

- **Table** `participation_kudos(assignment_id FK, giver_id FK, created_at)`, **unicité
  `(assignment_id, giver_id)`** (un kudos par personne, **togglable**). Cible = une
  `SessionAssignment` d'un **coéquipier** dont `attendance = 'going'` (axe présence ADR-43).
- **Verbes** (idempotents, symétriques aux réactions) :
  `PUT /assignments/{assignmentId}/kudos` (pose) / `DELETE …` (retire) → renvoie l'agrégat
  `{ count, givers: GroupTeammate[] }` (plafonné, même motif que D1).
- **Garde d'autorisation** : l'appelant et le titulaire de l'affectation doivent **partager un groupe
  actif** vers lequel la séance a été diffusée (fan-out ADR-30), **et** la présence cible doit être
  `going`. Sinon **404** (anti-énumération). On ne peut pas se donner un kudos à soi-même.
- **Notification** : nouveau type `group_kudos`, **gaté par la préférence `groupUpdates`** (ADR-22/23),
  destinataire = titulaire de l'affectation, `resourceId` = **`assignmentId`** — l'affectation du
  destinataire (**amendé le 2026-08-21, TLX-266** ; cette ligne prescrivait `sessionId`, voir
  *Amendement* en fin de document). Contenu **minimal** (ADR-10 : signal + `resourceId`, aucun nom
  ni détail dans le corps push).
- **Invariant dur (ADR-48 / ADR-08/21)** : le kudos porte **uniquement** sur le fait de **venir**
  (`attendance = going`) — **jamais** sur une performance, une charge ou un record. Aucun chiffre de
  perf ne transite ni ne conditionne un kudos.

### D3 — Conformité : la visibilité de présence pair-à-pair (POINT À VALIDER)

Le kudos suppose qu'un athlète **voie qu'un coéquipier a confirmé sa présence** à une séance — c'est
la visibilité que **ADR-43 §5 a explicitement différée à l'AIPD**, distincte du trombinoscope
d'identité (ADR-37) déjà validé. **Deux options, à trancher avant code :**

- **Option A — Étendre l'AIPD et livrer le kudos (recommandé).** Ajouter à TX-DPIA-007 §5.5 (ou §5.6)
  le flux « visibilité de présence confirmée entre coéquipiers de groupe », sur la **même base
  légale** (attente raisonnable d'équipe ; hors art. 9 ; participation ≠ santé). Validation RT, puis
  code complet du Palier 2 (D1 + D2).
- **Option B — Livrer D1 seul, différer le kudos.** Expédier les **réactions nominatives** (déjà
  couvertes par TX-DPIA-007 §5.5) maintenant ; sortir le kudos (D2/D3) dans un sous-ticket dédié une
  fois la note AIPD « présence » validée. Pas de nouveau flux de présence tant que non acté.

**Repli (tous cas).** Si la revue bloque, on **reste au Palier 1** (tout agrégé) — D1/D2 sont additifs
et réversibles (enrichissements de lecture + table isolée désactivable).

### Invariants & conventions

- **Zéro valeur en dur** : plafonds `reactors`/`givers` et TTL avatar via `.env` ; emoji bornés par
  l'enum serveur du Palier 1 ; libellés/couleurs via tokens DS.
- **Réutilisation infra** : schéma `GroupTeammate` (ADR-37), présignature `StorageModule`,
  notifications ADR-22/23, gardes d'appartenance existantes. Pas de nouvelle pile.
- **Tests obligatoires** : unicité kudos, garde 404 (non-membre / présence non confirmée / auto-kudos),
  plafond `reactors`/`givers`, exclusion membres partis/anonymisés, gate notification `groupUpdates`,
  frontière perf (aucun champ de perf exposé). Front : rendu pile d'avatars + action kudos.

**Conséquences.**

- **Positives :** réutilise massivement Palier 1 + ADR-37 ; additif/réversible ; frontière santé/perf
  intacte ; le découpage D1/D2 permet de livrer la moitié sûre (réactions nominatives) même si la note
  AIPD « présence » prend du temps.
- **Négatives / coûts :** une table légère (`participation_kudos`) + un type de notif ; D3 introduit
  une **dépendance conformité** (visibilité de présence) hors du périmètre déjà validé ; présignature
  d'avatars bornée mais non nulle (plafonds).

**Alternatives écartées.**

- **Endpoint séparé `GET …/reactions/{emoji}` (liste paresseuse).** Écarté : un appel par emoji tapé,
  alors que le plafond inline (D1) suffit à la pile d'avatars et évite un aller-retour.
- **Kudos scopé `/groups/{id}/…`.** Écarté : la présence vit sur l'affectation (ADR-43) ; scoper sur
  l'assignment colle au modèle et évite d'inventer une route de présence de groupe.
- **Kudos sur la performance/un record.** Écarté : viole ADR-08/21 (santé, consent-gated, coach-scopée).

---

## Amendement — 2026-08-21 (TLX-266) : `resourceId` = l'affectation, pas la séance

**Ce qui était prescrit.** §D2 posait `resourceId` = `sessionId`, avec la glose « ouvre la séance ».

**Ce que ça produisait.** L'athlète reçoit « Alex t'envoie des encouragements 👏 », tape dessus, et
obtient **« Impossible de charger cette séance »**. La notification n'offre aucune autre action : son
seul geste échoue, à tous les coups. Mesuré sur appareil (QA-04.6, 2026-08-21) — `resource_id` vérifié
en base comme étant bien le `sessionId`, et non l'affectation du destinataire.

**Pourquoi la prescription était fausse.** Côté athlète, **il n'existe aucune route indexée par
identifiant de séance**. Celle qui s'appelle `session/[id]` consomme une **affectation** : elle appelle
`getAssignment(id)`. Le nom de la route est le piège — ADR-49 a écrit « ouvre la séance » en toute
bonne foi, et la route qui porte ce nom ne prend pas ce qu'il croit. Émettre la séance envoyait le tap
sur `GET /assignments/<sessionId>` → 404.

C'est aussi la convention de **tous les autres types** : `session_assigned`, `performance_feedback` et
`performance_submitted` émettent une affectation, et `comments.service.ts` l'écrit noir sur blanc
(« `resourceId` = affectation : c'est la ressource navigable côté athlète »). `group_kudos` était le
seul à émettre une séance, et le seul dont le tap échouait.

**Décision.** `give()` émet l'`assignmentId` — l'affectation du destinataire, qu'il tient déjà en
paramètre. Aucun changement de contrat : la forme du payload est inchangée, seule la valeur l'est.

**Second symptôme, même cause, invisible celui-là.** `notification-ui.ts` produisait
`['assignment', <sessionId>]` comme clé d'invalidation à l'arrivée du push (TLX-235) : une clé qui ne
correspondait à **aucune** requête montée, donc une invalidation inerte pour les kudos. Rien n'était
visiblement cassé — la seule surface de kudos montre les 👏 *des coéquipiers*, jamais les siens, donc
le destinataire n'avait rien à rafraîchir. C'était une mine, pas une panne : le jour où un badge
« 3 👏 reçus » apparaît, il ne se rafraîchit pas et le commentaire jure que si. Les deux symptômes
tombent avec le même mot.

**Le point de méthode, qui vaut au-delà de ce ticket.** Le commentaire serveur, le commentaire client,
le test **et** le nom de la route avaient tous été écrits sur la même croyance fausse. Le test passait
parce qu'il se donnait `'asg-3'` — un identifiant d'affectation — et ne rencontrait jamais la valeur
réelle. **Un test qui choisit sa donnée d'entrée ne prouve rien sur ce que le système produit.** La
garde est donc côté API, sur la valeur émise, avec une fixture où l'identifiant d'affectation et celui
de séance diffèrent — sans quoi aucun test ne peut voir la différence.

**Vérifié au passage, plutôt que supposé.** Les six autres émetteurs ont été relus un par un :
`assignments.service.ts` (affectation), `performances.service.ts` (affectation), `comments.service.ts`
(affectation), `announcements.service.ts` et `announcement-replies.service.ts` (groupe),
`groups.service.ts` (groupe et affectation selon le type). Tous concordent avec ce que
`notificationHref` attend pour leur rôle. `group_kudos` était bien le seul écart.
