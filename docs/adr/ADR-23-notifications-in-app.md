# ADR-23 — Notifications in-app : historique, contrat de feed, écran préférences

- **Statut :** Proposé
- **Date :** 2026-06-10
- **Complète :** TX-DATA-006 (aucune table d'historique), `talent-x-openapi.yaml`
  (aucun endpoint de feed), TX-SPEC-002 §3 (« préférences de notification » citées
  dans l'édition de profil sans écran spécifié)
- **Tickets liés :** TLX-111 (notifications in-app + préférences) — **bloqué par cet
  ADR** pour sa moitié in-app ; TLX-84 (envoi push réel) — l'enregistrement du device
  token côté mobile y reste rattaché (nécessite un build natif + credentials).
- **Réf. :** ADR-22 (taxonomie d'événements, pipeline, table
  `notification_preferences` — « le feed in-app TLX-111 comblera »), ADR-10
  (minimisation du contenu), CLAUDE.md règle 7.

## Contexte

TLX-111 couvre deux choses : l'**UI des préférences** (entièrement spécifiée :
endpoints `GET/PUT /notifications/preferences` livrés par TLX-110, pattern visuel
« rangée + switch » du ProfileScreen de l'UI kit) et les **notifications in-app**
(centre de notifications dans l'app). Pour la seconde, rien n'existe : pas de table,
pas d'endpoint, pas d'écran maquetté. L'ADR-22 a volontairement exclu l'historique de
TLX-110 pour ne pas figer un schéma sans consommateur. Le consommateur arrive : il
faut fixer la persistance, le contrat et l'emplacement UI.

## Décision (proposée)

1. **Table `notifications`** (complément TX-DATA-006, migration expand-only) :
   `id` (uuid PK), `user_id` (FK users, cascade), `type` (texte, CHECK sur la
   taxonomie ADR-22), `resource_id` (uuid), `dedupe_key` (texte **UNIQUE** — même clé
   que le jobId BullMQ), `read_at` (timestamptz NULL), `created_at`. Index
   `(user_id, created_at DESC)` + index partiel non-lus `(user_id) WHERE read_at IS
   NULL`. Contenu minimal par construction (type + ressource, ADR-10) : les libellés
   sont composés côté client.
2. **Alimentation par le worker** : `NotificationProcessor` **persiste l'entrée
   in-app puis tente le push**, derrière la **même garde de préférence** — un type
   coupé ne produit ni push ni entrée in-app (un interrupteur = la notification,
   pas un canal). L'upsert sur `dedupe_key` rend le rejeu de job sans effet
   (idempotence bout en bout). Si le worker est arrêté, le feed prend du retard
   mais rien n'est perdu (file durable) — assumé.
3. **Contrat (extensions additives)** :
   - `GET /api/v1/notifications` — liste paginée (`page`/`limit`, tri
     `created_at DESC`) : `{ data: Notification[], meta: PageMeta, unreadCount }` ;
     `Notification` = `{ id, type, resourceId, readAt?, createdAt }`.
   - `POST /api/v1/notifications/read-all` — marque tout lu (200 `{ updated }`) ;
     appelé à l'ouverture du centre de notifications. Pas de lecture unitaire au
     MVP (aucun besoin UX identifié) — additif plus tard si besoin.
4. **Mobile** :
   - **Préférences** : section « Notifications » (4 switches branchés
     `GET/PUT /notifications/preferences`, optimistic update) accessible depuis
     l'onglet Profil — pattern « Préférences » du ProfileScreen (UI kit).
   - **Centre de notifications** : entrée « Notifications » dans le Profil avec
     **badge non-lus** (`unreadCount`), liste (libellé par type + date relative,
     navigation vers la ressource : affectation, performance, groupe), `read-all`
     à l'ouverture. États chargement / erreur / vide. Pas de cloche dans les
     tab bars au MVP (les onglets sont fixés par l'UI kit) — additif.
5. **Hors périmètre TLX-111** : enregistrement du device token côté mobile
   (`expo-notifications` → `POST /notifications/devices`) — requiert un build natif
   et les credentials FCM/APNs, reste dans TLX-84 avec l'envoi réel.

**Compatibilité.** Extensions purement additives (nouvelle table, nouveaux
endpoints) ; aucun changement sur l'existant TLX-110.

## Conséquences

- **+** Le feed réutilise tel quel la taxonomie, la garde et l'idempotence ADR-22 —
  une seule logique de décision (worker), pas de double gate API/worker.
- **+** Contrat minimal (2 endpoints) calé sur les enveloppes de pagination
  existantes ; badge et liste se branchent sur une seule requête.
- **−** Le feed dépend du worker (latence si arrêt) — assumé, file durable.
- **−** Préférence off = silence total (pas d'entrée in-app) : un utilisateur qui
  réactive plus tard ne « rattrape » pas les événements coupés — assumé (c'est le
  sens d'un opt-out).

## Alternatives écartées

- **Persistance côté API à l'émission** (worker = push seulement) : feed disponible
  même worker arrêté, mais duplique la garde de préférence des deux côtés et insère
  une écriture DB dans le chemin de la requête métier. Rejetée (cohérence ADR-22).
- **Préférences ne coupant que le push** (in-app toujours persisté) : deux modèles
  mentaux pour un interrupteur, collecte de données que l'utilisateur a refusées.
  Rejetée (minimisation RGPD).
- **Lecture unitaire `PUT /notifications/{id}/read`** : surface en plus sans besoin
  UX au MVP. Écartée (additif).
- **Cloche dans la tab bar** : modifie la navigation fixée par l'UI kit (5 onglets).
  Écartée au MVP (le badge vit sur l'entrée Profil).
