# ADR-22 — Infrastructure notifications : préférences, taxonomie d'événements, pipeline push

- **Statut :** Proposé
- **Date :** 2026-06-10
- **Complète :** TX-DATA-006 (aucune table de préférences), TX-ARCH-001 §4.5/§4.6
  (pipeline prescrit mais taxonomie des déclencheurs non spécifiée),
  `talent-x-openapi.yaml` (schéma `NotificationPreferences` sans persistance définie)
- **Tickets liés :** TLX-110 (infrastructure APNs/FCM) — **bloqué par cet ADR** ;
  TLX-111 (notifications in-app + préférences) — consommera la même taxonomie.
- **Réf. :** ADR-10 (transfert hors UE assumé et **minimisé** : aucun résultat de
  performance ni donnée de santé dans un push — signal + identifiant de ressource
  uniquement), TX-ARCH-001 §4.5 (BullMQ, worker séparé, jobs idempotents, backoff,
  dead-letter), CLAUDE.md règle 7.

## Contexte

TLX-110 doit implémenter les 4 endpoints `/notifications/*` (aujourd'hui squelettes
501) et le pipeline d'envoi. Le contrat OpenAPI définit `DeviceToken` (porté par la
table `device_tokens`, TX-DATA-006 §4.4) et `NotificationPreferences` (4 booléens :
`sessionAssigned`, `performanceFeedback`, `groupUpdates`, `marketing`) — mais **aucune
table ne porte ces préférences**, et **aucun document ne fixe quel événement métier
déclenche quelle notification**. Par ailleurs l'envoi réel exige des credentials
APNs/FCM indisponibles en dev : la frontière entre infrastructure testable et
adaptateurs externes doit être explicite.

## Décision (proposée)

1. **Table `notification_preferences`** (migration additive, TX-DATA-006 §4.x) —
   1:1 avec `users` : `user_id` (PK, FK cascade), `session_assigned`,
   `performance_feedback`, `group_updates` (booléens, défaut `true`), `marketing`
   (booléen, défaut **`false`** — opt-in RGPD), `updated_at`. **Absence de ligne =
   défauts** : `GET` répond les défauts sans écrire, `PUT` upsert. Colonnes
   explicites plutôt que JSONB : 4 drapeaux stables, requêtables par le worker.
2. **Taxonomie des événements (MVP)** — trois émissions, chacune gardée par sa
   préférence :
   - `session_assigned` : affectation créée → notifie l'**athlète** ;
   - `performance_feedback` : commentaire **du coach** sur une performance →
     notifie l'**athlète** ;
   - `group_update` : athlète rejoint le groupe → notifie le **coach**.
   `marketing` n'a **aucune émission** au MVP (le drapeau existe au contrat, prêt
   pour les campagnes V2). Extension = nouvelle valeur de l'enum interne + garde.
3. **Pipeline** (réplique du pattern `data-export`) : le service métier émetteur
   enfile un job BullMQ sur une file `notifications` avec un payload **minimal et
   non sensible** `{ type, recipientUserId, resourceId }` ; le worker (process
   séparé existant) charge préférences (garde) + device tokens **actifs**
   (`revoked_at IS NULL`) du destinataire, compose un contenu générique (titre
   localisé par type + identifiant de ressource, conformément à l'ADR-10) et
   délègue au provider. Jobs idempotents (`jobId` dérivé de l'événement), backoff
   exponentiel, échecs en dead-letter. Aucune persistance d'historique ici
   (l'in-app feed = TLX-111, additif).
4. **Provider push abstrait** — interface `PushProvider.send(tokens, payload)`
   unique frontière vers l'extérieur. MVP : implémentation **logging** (dev/CI,
   aucun réseau) ; adaptateurs APNs/FCM branchés par configuration (`.env`) quand
   les credentials existeront, sans toucher au pipeline. Un token signalé invalide
   par le provider est révoqué (`revoked_at`).
5. **Cycle de vie des tokens** (TX-ARCH-001 §4.6) : `POST /notifications/devices`
   **upsert par `token`** (unique en base) — ré-enregistrement = ré-association au
   compte courant + `last_seen_at` rafraîchi + `revoked_at` remis à NULL ;
   `DELETE /notifications/devices/{id}` = révocation logique (ownership, 404 si
   étranger). La révocation au logout (logout-all) reste hors périmètre TLX-110.

**Compatibilité.** Endpoints 501 → 200/201/204 conformes au contrat existant (aucun
changement OpenAPI requis) ; migration additive ; aucun consommateur impacté.

## Conséquences

- **+** TLX-111 (in-app + préférences UI) se branche sur la même taxonomie et la
  même table — zéro rework.
- **+** Frontière provider nette : l'infrastructure (endpoints, file, gardes,
  composition) est intégralement testable sans credentials ; seul `send()` réel
  reste à valider (ticket de suivi dédié).
- **+** Conformité ADR-10 par construction : le payload du job comme du push ne
  contient jamais de donnée de santé.
- **−** Une table de plus pour 4 booléens — assumé (style TX-DATA-006, colonnes
  requêtables, défauts en base).
- **−** Pas d'historique de notifications au MVP : un push raté (préférence off,
  aucun device) est perdu — assumé, le feed in-app TLX-111 comblera.

## Alternatives écartées

- **JSONB `notification_preferences` sur `users`** : pas de défauts déclaratifs ni
  de typage en base, drift silencieux possible avec le contrat. Rejetée.
- **Envoi synchrone dans le cycle requête/réponse** : contraire à TX-ARCH-001 §4.5,
  couple la latence API à APNs/FCM. Rejetée.
- **Table d'historique des notifications dès TLX-110** : c'est le périmètre de
  TLX-111 (in-app) ; la créer ici sans consommateur figerait un schéma prématuré.
  Écartée (additif).
- **SDK APNs/FCM intégrés directement dans les services métier** : indissociable
  des credentials, non testable, contraire à la frontière provider. Rejetée.
