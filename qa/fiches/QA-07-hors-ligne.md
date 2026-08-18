# QA-07 — Hors ligne : saisie, idempotence, reprise

Le flux critique de la spec §11.3 : un athlète saisit sa perf **au stade, sans
réseau** — c'est le cas nominal du produit, pas un cas limite. Appareil B, build
`preview`, réseau coupé par **mode avion** (pas le Wi-Fi seul : le mobile resterait).

## QA-07.1 — Saisie de performance hors ligne, puis reprise

**Couvre** : `submitPerformance` + en-tête `Idempotency-Key` + `OfflineSync`.
**Étapes** : ouvrir le détail de la séance **avant** de couper le réseau ; passer en
mode avion ; saisir la perf complète ; valider ; observer l'état affiché ; rétablir le
réseau ; attendre la synchronisation (ou relancer l'app si c'est le déclencheur).
**Attendu** : la validation hors ligne **ne perd rien** et l'affiche honnêtement (en
attente, pas de faux « envoyé ») ; au retour du réseau, la perf part **une seule
fois** ; l'UI passe à « Modifier ma perf ».
**Preuve** : `select count(*) from performances where assignment_id = '<id>'` → **1** ;
`select count(*) from notifications where type = 'performance_submitted' and
resource_id = '<id>'` → **1** (pas de doublon de notification coach non plus).

## QA-07.2 — Reprise brutale : l'app est tuée avant la synchro

**Couvre** : la persistance de la file hors ligne.
**Étapes** : rejouer QA-07.1 mais **tuer l'app** (swipe) pendant le mode avion, après
validation ; rétablir le réseau ; relancer l'app ; se laisser guider.
**Attendu** : la perf saisie survit au kill et part à la relance — c'est la promesse
du stockage local ; si elle est perdue, c'est un défaut **majeur** (perte de donnée
utilisateur).
**Preuve** : même SQL que QA-07.1.

## QA-07.3 — Doublon volontaire : la clé d'idempotence au travail

**Couvre** : `Idempotency-Key` (spec §9.5), réponse 409 `IdempotencyConflict`.
**Étapes** : via le véhicule de diagnostic, rejouer le **même** `POST
/assignments/{id}/performance` avec la **même** clé d'idempotence (payload identique),
puis avec la même clé et un payload **différent**.
**Attendu** : même clé + même payload → réponse rejouée sans double écriture ; même
clé + payload différent → **409** ; jamais deux lignes en base.
**Preuve** : les codes HTTP + le `count(*)` qui reste à 1.

## QA-07.4 — Écrans en absence de réseau

**Couvre** : les états d'erreur de l'app entière (pas de contrat spécifique).
**Étapes** : en mode avion, parcourir : accueil, séances, détail non préchargé,
progression, hub de groupe, profil ; puis rétablir et re-parcourir.
**Attendu** : chaque écran montre un état d'erreur **actionnable** (réessayer) — jamais
de spinner infini, jamais de crash, jamais d'écran blanc ; au retour du réseau, les
écrans se réhydratent (au pire via le bouton réessayer — noter les écrans qui exigent
une navigation pour repartir).
**Preuve** : liste écran par écran au rapport (conforme / spinner / crash).

## QA-07.5 — Session et hors-ligne combinés

**Couvre** : l'interaction refresh/401 avec la coupure (TLX-009).
**Étapes** : laisser l'access token expirer (>15 min) **pendant** le mode avion, puis
rétablir le réseau et agir immédiatement (tirer-rafraîchir).
**Attendu** : le refresh silencieux rattrape la session — l'utilisateur n'est **pas**
déconnecté par une simple coupure réseau (une erreur réseau conserve les jetons,
seule une réponse 401/409 du serveur les efface).
**Preuve** : aucune redirection login ; les données se rechargent.
