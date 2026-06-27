# ADR-55 — Notifications in-app nominatives (push générique préservé)

- **Statut :** Accepté (2026-06-28, validé)
- **Date :** 2026-06-28
- **Amende / complète :** **ADR-10** (minimisation : pas de donnée métier dans les notifications),
  **ADR-23** (notification in-app = signal minimal `type` + `resourceId`, libellé côté client),
  **ADR-22** (file push, payload non sensible). Réutilise le lien coach↔athlète (ADR-05/08) et
  l'appartenance de groupe (ADR-16/30) comme base d'autorisation.
- **Réf. :** rapport de test manuel coach `apps/mobile/e2e/RAPPORT_TEST_MANUEL_COACH.md` (R1).
  CLAUDE.md règle 7 (divergence structurante vs specs → ADR avant code).
- **Tickets liés :** R1 (ce périmètre).

## Contexte

Les notifications affichent des libellés **génériques** (« Un athlète a rejoint votre groupe »,
« Un athlète a soumis une performance »). Le coach a demandé du **nominatif** (« Léa a rejoint
votre groupe ») — R1.

Or c'est **impossible en l'état** : par ADR-10/23, le nom n'existe **nulle part** dans la chaîne.
Le signal est minimal à trois niveaux :

1. **Payload de file** `NotificationJobPayload` = `type` + `recipientUserId` + `resourceId`.
2. **Au repos** : table `notification` = `type` + `resourceId` (+ `dedupeKey`).
3. **Rendu** : libellés génériques composés client par type (`notification-ui.ts`) ; push générique
   composé par le worker (`notification.processor.ts`).

ADR-10 vise avant tout le **canal non maîtrisé** : le **push** transite par FCM/APNS (tiers,
écran verrouillé) → la minimisation y est pleinement justifiée. Le **feed in-app**, lui, est servi
par `GET /notifications` **authentifié**, rendu *dans* l'app, à un destinataire **déjà autorisé** à
connaître ce nom (lien coach↔athlète établi, ou co-appartenance au groupe). Y afficher un prénom
n'est donc **pas une divulgation nouvelle**.

## Décision

### D1 — Séparer les deux canaux

- **Push : inchangé, générique** (ADR-10 préservé pour FCM/APNS et l'écran verrouillé). Le worker
  ne reçoit jamais de nom et n'en compose jamais.
- **Feed in-app : nominatif** — `GET /notifications` porte un `actor` résolu par l'API.

### D2 — `actorId` capturé à l'émission, jamais de nom transporté/persité en clair

- Ajout d'un **`actorId` optionnel** au payload de file et à la table `notification`, **capturé à
  l'émission** (l'acteur y est toujours connu : l'athlète qui rejoint, le coach qui commente/annonce,
  l'athlète qui soumet, l'auteur du kudos/de la réponse).
- On stocke **l'identifiant** (FK vers un `user` déjà en relation avec le destinataire), **pas le
  nom** : aucune donnée métier nouvelle au repos ni dans la file.

### D3 — Résolution du nom au **read time**, minimisée

- `GET /notifications` résout en **batch** (une requête pour la page) les `actorId` → `displayName`.
- `displayName` = **prénom** (repli « Prénom N. » si collision/absence), pas le nom complet :
  minimisation même in-app.
- Le DTO gagne un champ **optionnel** `actor?: { id, displayName }` (rétro-compatible). `resourceId`
  inchangé (navigation).

### D4 — Rendu front paramétré + repli

- `notification-ui` : les libellés deviennent fonction de `actor?.displayName`, avec **repli
  générique** quand l'acteur est absent (anciennes lignes antérieures à la migration, acteur
  supprimé, ou type sans acteur pertinent). Ex. `group_update` → « {prénom} a rejoint votre
  groupe » sinon « Un athlète a rejoint votre groupe ».

### D5 — Invariants

- **Push strictement inchangé** (aucun nom). Migration **additive** (`actorId` nullable, pas de
  backfill : les anciennes notifications restent génériques via le repli). DTO `actor` **optionnel**
  → client rétro-compatible. Worker : seule la persistance in-app gagne `actorId` (le `data` push
  reste `{ type, resourceId }`).

## Conséquences

- **+** Notifications **nominatives** in-app (valeur produit R1) sans affaiblir la minimisation du
  canal push (ADR-10).
- **+** Débloque, à terme, un rendu plus riche du feed (« Léa · 200m a soumis… ») et se raccorde au
  besoin d'un « à revoir » nominatif (cf. R10).
- **−** **Amende ADR-10/23** : la table `notification` gagne une FK `actorId` et le DTO un `actor`
  résolu. Assumé et borné (id seulement au repos ; prénom résolu, à un destinataire autorisé).
- **−** Changement transverse : schéma + migration, payload de file, **tous les sites d'émission**,
  DTO + openapi, régénération du client, templates front. Couverture unitaire **et** intégration.

## Alternatives écartées

- **Push aussi nominatif.** Rejeté : un nom sur l'écran verrouillé / chez FCM-APNS affaiblit ADR-10
  sans bénéfice proportionné.
- **Résoudre le nom uniquement depuis `resourceId` au read (sans `actorId`).** Rejeté : marche pour
  les types « affectation » (acteur dérivable) mais **pas** pour `group_update`/`group_kudos`/
  `group_reply` (l'acteur n'est pas encodé dans la ressource) — justement les cas cités par R1.
- **Stocker le nom au repos dans la notification.** Rejeté : duplique une donnée personnelle,
  se désynchronise si l'utilisateur se renomme, et alourdit la minimisation. La résolution au read
  reste fraîche et minimale.
- **Composer le libellé nominatif côté serveur.** Rejeté : ADR-23 garde la composition (i18n,
  rôle) **côté client** ; on n'envoie que la donnée (`actor`), pas la phrase.

## Plan (additif, testé)

1. **Schéma** : `notification.actorId String?` (FK `user`, `onDelete: SetNull`) + migration.
2. **File** : `NotificationJobPayload.actorId?` ; producteur `enqueue` le transmet.
3. **Émission** : chaque service émetteur passe l'`actorId` (acteur de l'action).
4. **Worker** : persistance in-app `create { …, actorId }` ; **push inchangé**.
5. **Read** : `notifications.service` résout `actor` en batch ; DTO + **openapi** `actor?`.
6. **Client** : régénération orval + rebuild `dist`.
7. **Front** : `notification-ui` libellés paramétrés + repli ; écran consommateur.
8. **Tests** : unités (résolution, repli, par type) + intégration (émission → read nominatif, DB :5433).
