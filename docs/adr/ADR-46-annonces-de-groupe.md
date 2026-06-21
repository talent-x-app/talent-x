## ADR-46 — Annonces de groupe (coach → membres) : table dédiée + notification `group_announcement`

- **Statut :** Accepté (2026-06-21, validé d'office)
- **Date :** 2026-06-21
- **Réf. :** ADR-26 (lecture athlète des groupes), ADR-30 (membres actifs d'un groupe), ADR-37 (vue pair minimisée), ADR-22 (infra notifications), ADR-23 (notifications in-app), ADR-08 (RBAC + appartenance), ADR-44 (hub de groupe mince), `talent-x-openapi.yaml`, TLX-173.

**Contexte.** Le hub de groupe athlète (mince, ADR-44) manque d'un **canal de communication
descendant** : le coach n'a aucun moyen de dire « séance déplacée », « compèt samedi », etc. C'est
la pièce qui donne au groupe sa valeur d'**équipe** côté athlète. Besoin : le **coach propriétaire**
publie une annonce courte ; les **membres actifs** la lisent et sont **notifiés**.

**Décision.**

### 1. Modèle — table dédiée `group_announcements`
Nouvelle table (pas de réutilisation de `comments`, qui est *scopé séance*) :
```
group_announcements(id, group_id FK, author_id FK→users, body text, created_at, deleted_at)
```
Suppression **soft** (`deleted_at`) — cohérent avec le reste (groupes, affectations). Corps **texte
seul** (≤ 1000 car.), pas de titre au MVP. Édition (`PATCH`) **différée** : publier / supprimer
suffit ; corriger = supprimer + republier.

### 2. Contrat (additif)
- `GET /groups/{id}/announcements` → `GroupAnnouncementList` (récentes d'abord). RBAC : **coach
  propriétaire OU athlète membre actif** (404 anti-énumération sinon).
- `POST /groups/{id}/announcements` (`AnnouncementCreate { body }`) → 201 `GroupAnnouncement`. RBAC :
  **coach propriétaire**.
- `DELETE /groups/{id}/announcements/{announcementId}` → 204. RBAC : **coach propriétaire** (soft).
- `GroupAnnouncement = { id, groupId, body, author: UserSummary, createdAt }`. L'auteur (le coach)
  est déjà connu des membres (ADR-26/37) — pas de fuite.

### 3. Notification — **réutilise** l'infra, nouveau type `group_announcement`
À la publication, fan-out d'une notification à **chaque membre actif** (sauf l'auteur) via
`NotificationQueueService` (ADR-22). On ajoute le type **`group_announcement`** plutôt que réutiliser
`group_update` (qui signifie déjà « un athlète a rejoint », libellé coach-only) :
- `NotificationType += 'group_announcement'` ; CHECK `ck_notification_type` étendu (migration additive,
  même schéma que `performance_submitted`).
- **Pas de nouvelle colonne de préférence** : gardé par la préférence **`groupUpdates`** existante
  (`PREFERENCE_GATE[group_announcement] = 'groupUpdates'`).
- Contenu **générique** (ADR-10/23 : signal + `resourceId`, aucune donnée sensible poussée) ;
  `resourceId = groupId` → tap = ouvrir le groupe. Présentation in-app + cible de navigation
  **athlète → `/(athlete)/group/[id]`** (libellé dédié, distinct de `group_update`).
- `dedupeKey = group_announcement--{announcementId}--{memberId}` (idempotence ADR-23, jobId BullMQ
  sans `:`).

### 4. UI
- **Athlète** : nouvel onglet **« Annonces »** dans le hub (par défaut) — liste lecture seule (auteur,
  date relative, corps), états vide/erreur. Donne enfin du contenu vivant au hub mince (ADR-44).
- **Coach** : section **« Annonces »** sur l'écran de groupe (compose + publier + liste + supprimer).

### 5. RGPD
Aucune donnée nouvelle de santé/perf. L'auteur exposé est le **coach** (déjà visible des membres,
ADR-26/37). Le contenu est rédigé par le coach (responsabilité éditoriale) ; pas de visibilité
pair-à-pair nouvelle. Notification générique (ADR-10) — le corps de l'annonce ne transite pas dans le
push.

**Conséquences.**

- **Positives :** canal d'équipe descendant — la valeur manquante du hub athlète ; réutilise l'infra
  notifications (1 type + 1 ligne de gate + 1 message, **pas de colonne de préférence**) ; surface de
  contrat minimale (3 verbes) ; cohérent soft-delete.
- **Négatives / coûts :** une table + une migration de type de notif ; pas d'édition au MVP
  (supprimer/republier) ; pas de fil de discussion (annonce descendante seulement — les questions se
  posent sur la séance, FeedbackThread TLX-118).

**Alternatives considérées.**

- **Réutiliser `comments`** (scopé séance). Écarté : sémantique et scope différents (séance vs groupe),
  mélangerait deux objets.
- **Réutiliser le type `group_update`.** Écarté : signifie déjà « un membre a rejoint » (libellé
  coach-only, route `/(coach)/athletes`) — collision de copie/sémantique.
- **Nouvelle colonne de préférence `group_announcement`.** Écarté : `groupUpdates` couvre déjà la
  catégorie ; éviter une migration de préférence inutile.
- **Fil bidirectionnel (chat de groupe).** Hors MVP : modération, charge, RGPD pair-à-pair — annonce
  descendante d'abord.
- **Édition d'annonce (`PATCH`).** Différée : supprimer + republier au MVP.
