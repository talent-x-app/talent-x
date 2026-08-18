# QA-05 — Notifications : push, tap, préférences, cycle de vie du device

La chaîne ADR-22/23 sur appareil réel. `session_assigned` et `performance_feedback` ont
été validés le 2026-08-18 (S20 FE, staging) — la campagne les **rejoue** pour la
non-régression et complète ce qui manque : **`group_update` sur l'appareil coach**
(le trou de TLX-84) et le cycle de vie complet du device token.

**Rappels de diagnostic** (déjà payés, §5 du plan) : le silence du worker est un
succès ; l'API ne journalise pas les requêtes ; l'enregistrement n'a lieu qu'au passage
par `signIn` → toute bascule de compte/environnement exige déconnexion/reconnexion.

## QA-05.1 — Enregistrement du device à la connexion

**Couvre** : `registerDevice` (TLX-226, correctif `08a1b2d`).
**Étapes** : connexion de l'athlète sur l'appareil B (permission notifications demandée
et **accordée**) ; même chose pour le coach sur l'appareil A.
**Attendu** : une ligne `device_tokens` active par appareil, liée au bon compte.
**Preuve** : `select platform, length(token), user_id, revoked_at from device_tokens
order by created_at desc limit 5` → `fcm`/`apns` selon l'appareil, `revoked_at` null.

## QA-05.2 — Les trois types de la DoD TLX-84, côté athlète

**Couvre** : réception `session_assigned`, `performance_feedback` + affichage premier
plan / arrière-plan.
**Étapes** : le coach affecte une séance (app athlète **en arrière-plan**) → bannière
système ; il commente une perf (app athlète **au premier plan**) → bannière quand même
(handler TLX-84) ; contenu inspecté.
**Attendu** : messages **génériques** (ADR-10 : « Une séance t'a été affectée », jamais
un nom, un titre de séance ou une marque) ; si pas de bannière heads-up mais présence
dans le volet → réglage One UI « Afficher en pop-up », à noter, **pas un défaut app**.
**Preuve** : bannières observées + `select type, dedupe_key from notifications where
user_id = '<athlete>' order by created_at desc limit 5` (pas de doublon — upsert par
`dedupe_key`).

## QA-05.3 — `group_update` sur l'appareil coach — **jamais validé à ce jour**

**Couvre** : le 3ᵉ type de la DoD TLX-84. Jusqu'ici le coach était un script sans
appareil (worker : « Notification sans cible » — correct mais non probant).
**Départ** : coach connecté sur l'appareil A (QA-05.1), un athlète hors du groupe
(athlète 2 après un `leaveGroup`, ou compte neuf à boîte réelle).
**Étapes** : l'athlète rejoint le groupe par code.
**Attendu** : push « Groupe mis à jour · Un athlète a rejoint votre groupe » sur
l'appareil coach ; le tap ouvre l'écran du groupe.
**Preuve** : bannière + **zéro** ligne « sans cible » dans le worker sur la fenêtre du
test. **Clore ce scénario = clore la partie technique de TLX-84** (le noter au rapport
et basculer le ticket).

## QA-05.4 — Tap, centre de notifications, badge

**Couvre** : `listNotifications`, `readNotification`, `readAllNotifications` +
navigation `notificationHref`. **⚠️ défaut connu TLX-231.**
**Étapes** : depuis une bannière de chaque type reçu : taper → vérifier l'écran
d'atterrissage (séance affectée → détail ; feedback → fil ; groupe → hub/groupe) ;
ouvrir le centre : lecture unitaire au tap (pastille retirée, badge décrémenté),
« Tout marquer lu » → badge 0 sans effacer les items (TLX-189).
**Attendu (adapté au défaut connu)** : **TLX-231 — le badge de la cloche ne bouge pas à
l'arrivée d'un push** tant qu'on ne navigue pas ; confirmer que c'est bien le seul
mécanisme en cause (naviguer → le badge se met à jour), signaler toute aggravation.
**Preuve** : `read_at` posé en base après lecture unitaire.

## QA-05.5 — Préférences : off = silence total

**Couvre** : `getNotificationPreferences`, `updateNotificationPreferences`.
**Étapes** : l'athlète coupe « Mises à jour du groupe » ; le coach publie une annonce ;
réactiver ensuite.
**Attendu** : **ni push ni entrée in-app** (la préférence gate les deux — ADR-23) ; le
worker journalise « préférence off » ; marketing est **opt-in** par défaut (vérifier
l'état initial des toggles).
**Preuve** : log worker « Notification ignorée (préférence off) » + absence de ligne
`notifications` pour cet événement.

## QA-05.6 — Cycle de vie du device : déconnexion, changement de compte

**Couvre** : `revokeDevice` + le correctif TLX-226 en conditions réelles.
**Étapes** : (a) déconnexion de l'athlète sur B → le coach lui affecte une séance →
**aucun push** sur B (worker : « sans cible ») ; (b) reconnexion → push de nouveau ;
(c) **changement de compte** : connecter l'athlète 2 sur B, affecter une séance à
l'athlète 2 → push reçu ; vérifier en base que le token de B est **ré-associé** à
l'athlète 2 (upsert TX-ARCH-001 §4.6) et que l'athlète 1 n'a plus de device actif sur B.
**Attendu** : jamais de push adressé au mauvais compte — c'est le bug de prod que le
correctif ferme ; sa preuve en conditions réelles est ce scénario.
**Preuve** : `select user_id, revoked_at from device_tokens where token like
'<préfixe>%'` à chaque étape.
