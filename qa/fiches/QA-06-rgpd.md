# QA-06 — RGPD : consentements, export, suppression, minimisation

Les chemins qui engagent juridiquement (TX-SEC-003, AIPD). Priorité absolue de la
campagne : un défaut ici est **bloquant** par définition. Spec §11.4 et §11.5.

## QA-06.1 — Retrait du consentement de traitement

**Couvre** : `getConsents`, `updateConsent` (`data_processing`).
**Étapes** : l'athlète retire `data_processing` depuis Confidentialité & données ;
tenter une saisie de perf ; re-consentir.
**Attendu** : la saisie est bloquée par **403 `CONSENT_REQUIRED`** (vérifié au contrat
**et** dans `ConsentGate` — la garde couvre aussi `updatePerformance`) ; le reste de
l'app dégrade proprement, sans crash ; le re-consentement rétablit tout.
**Preuve** : le 403 ; `select type, granted, coach_id, text_version, granted_at,
revoked_at, created_at from consents where user_id = '<id>' order by created_at` —
la table est **append-only**, une ligne par bascule (base juridique, TX-SEC-003 §6).

⚠️ **`consents` n'a pas de colonne `updated_at`** : `granted_at`, `revoked_at` et
`created_at`, pas autre chose. La requête de preuve précédente ne s'exécutait pas.

⚠️ **Lire la chronologie avant de conclure quoi que ce soit sur un écran.** Le 21/08,
« j'ai remis sur ON et je ne vois toujours pas mes perfs » semblait démenti par une sonde
API renvoyant `403` — mais la sonde tournait **après** un second retrait fait entre-temps.
L'observation d'écran, elle, avait bien eu lieu consentement actif. Ordonner les
horodatages des bascules et ceux de l'observation, systématiquement.

⚠️ **Rétablir le consentement ne rafraîchit aucun écran** (TLX-270) : `retry: false`,
aucune invalidation à la bascule, « Réessayer » masqué justement dans ce cas, et pas de
tirer-pour-rafraîchir. Tant que le ticket est ouvert, **relancer l'application** après
tout rétablissement, sinon les scénarios suivants qualifient un cache périmé.

## QA-06.2 — Consentement d'accès coach, **par coach** (ADR-51 §D2a)

**Couvre** : `updateConsent` (`coach_access` scopé), gates coach.
**Départ** : l'athlète est membre du groupe du coach QA (adhésion par code = consentement
**scopé** à ce coach).
**Étapes** : le coach ouvre stats/progression de l'athlète (accès OK) ; l'athlète
**révoque** l'accès de ce coach dans Confidentialité (section par coach — visible
seulement en multi-coach, sinon révocation globale) ; le coach retente ; l'athlète
rétablit.
**Attendu** : après révocation, le coach reçoit **403** sur les 6 portes (stats,
progression, records…) mais l'athlète reste membre du groupe ; le rétablissement
rouvre l'accès sans re-adhésion.
**Preuve** : `select type, coach_id, granted from consents where user_id = '<athlete>'
and type = 'coach_access'` — la ligne est **scopée** (`coach_id` non null).

## QA-06.3 — Cloisonnement des données entre rôles

**Couvre** : minimisation transverse (recoupe QA-02.6, QA-04.5).
**Checklist** :

- séances libres invisibles côté coach (ADR-51 §D3) — fait en QA-02.6 ;
- roster limité à nom + avatar (ADR-37) — fait en QA-02.1/04.5 ;
- agrégat de présence sans identités (ADR-45) — fait en QA-03.4 ;
- push sans donnée métier (ADR-10) — fait en QA-05.2 ;
- motif d'absence jamais exposé aux coéquipiers — vérifier sur `getTeammatesAttendance`.
  **Attendu** : chaque case cochée avec sa preuve d'origine ; toute fuite = bloquant.

## QA-06.4 — Export des données : la vraie livraison ⚠️ écart MinIO/OVH

**Couvre** : `requestExport`, `getExport`. **C'est le scénario qui motive la fiche** :
les URL présignées n'ont **jamais** été validées contre le vrai OVH Object Storage — le
staging tourne sur MinIO, qui pardonne des écarts qu'OVH ne pardonnera pas
(`S3_ENDPOINT` public signé, host de la signature, TTL).
**Étapes** : demander l'export depuis l'app ; suivre l'état (202 → poll `getExport`) ;
**télécharger l'archive depuis le téléphone** (réseau mobile, pas le Wi-Fi du poste) ;
ouvrir l'archive ; retenter le lien après expiration (`EXPORT_URL_TTL_SECONDS` = 24 h —
tester à J+1 ou réduire le TTL le temps du test).
**Attendu** : lien en `https://staging-storage.talent-x.app/...` (jamais
`minio:9000`) ; l'archive contient les données de l'athlète (profil, consentements,
perfs, records) et **rien d'autrui** ; lien expiré → refus propre ; l'archive est
purgée après `EXPORT_ARCHIVE_TTL_HOURS`.
**Preuve** : URL complète recopiée au rapport ; contenu de l'archive listé ; worker :
job `data-export` traité sans erreur.
**Avant la prod** : rejouer CE scénario sur un bucket **OVH réel** (même code, autres
endpoints) — décision d'environnement à tracer au rapport.

## QA-06.5 — Suppression de compte et purge

**Couvre** : `deleteMe` (ADR-15, rétention `ACCOUNT_PURGE_RETENTION_DAYS` = 30 j).
**Départ** : un compte athlète **jetable** à boîte réelle (pas le compte QA principal),
avec quelques données (perf, photo, adhésion).
**Étapes** : supprimer le compte depuis l'app (confirmation) ; tenter de se
reconnecter ; vérifier l'état en base ; vérifier ce que voient le coach et les
coéquipiers ; documenter ce qui déclenchera la purge définitive à J+30.
**Attendu** : reconnexion impossible ; le compte disparaît des rosters ; les données
passent en rétention (soft-delete horodaté), **pas** en purge immédiate ; le job de
purge est planifié (`account-purge`).
**Preuve** : `select deleted_at from users where email = '<jetable>'` ; état du roster
côté coach ; présence du job/cron de purge dans le worker.
**Limite assumée** : la purge effective à J+30 ne sera **pas observée** pendant la
campagne — consigner la date attendue au rapport et créer un rappel de vérification.
