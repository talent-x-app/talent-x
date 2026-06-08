# ADR-13 — Jobs asynchrones pour les opérations RGPD (export & suppression)

- **Statut :** Accepté
- **Date :** 2026-06-08
- **Raffine :** ADR-09 (file de jobs BullMQ/Redis + worker dédié)
- **Tickets liés :** TLX-035 (socle infra + `export_jobs`) · débloque TLX-033 (export) puis TLX-034 (suppression)
- **Réf. :** TX-SPEC-002 §7 (opérations longues) · TX-ARCH-001 §4.5 (purge planifiée) · TX-SEC-003 (droits des personnes) · TX-DATA-006 §12 · `talent-x-openapi.yaml`

## Contexte

Le contrat `docs/talent-x-openapi.yaml` modélise l'export et la suppression comme des opérations
**asynchrones** : `POST /users/me/export` et `DELETE /users/me` renvoient **202 + un `Job` { jobId, status }**,
l'export étant ensuite suivi via `GET /users/me/export/{jobId}` (`downloadUrl` / `expiresAt`).

ADR-09 a déjà acté le **principe** (file BullMQ/Redis + worker dédié, réponses 202 + ressource de statut).
Restent deux manques concrets : (a) le worker n'est pas câblé ; (b) le modèle de données ne prévoit
**aucune table de jobs** — TX-DATA-006 §12 repose sur un **soft-delete (`deleted_at`) + purge planifiée**.
Le flux POST→jobId→GET de l'export impose de **persister l'état du job**, ce qui constitue une décision
de modélisation à prendre hors d'un ticket d'endpoint. Cet ADR tranche cette modélisation.

## Décision

Traiter **export** et **suppression** séparément, pour n'ajouter au modèle que le strict nécessaire.

### 1. Export — asynchrone avec état persistant

- Nouvelle table **`export_jobs`** (voir Conséquences) ; **pas** de table générique `data_jobs`.
- Worker **BullMQ + Redis** (ADR-09) : file `data-export`, processor qui rassemble les données de la
  personne, produit une **archive** (JSON/zip), la dépose sur le **stockage objet** (OVH Object Storage,
  S3-compatible) et passe le job à `ready`.
- `GET /users/me/export/{jobId}` : renvoie le `status` ; si `ready`, **génère une URL présignée au moment
  de l'appel** (TTL court, ex. 24 h) et la retourne avec `expiresAt`.
- **Un seul export actif par utilisateur** (idempotence / anti-abus) — appliqué au niveau base par un
  index unique partiel sur les jobs `pending`/`processing`. Tâche planifiée de **nettoyage** des archives
  expirées (+ passage du job à `expired`).

### 2. Suppression — conforme à TX-DATA-006 §12 (inchangé)

- `DELETE /users/me` exécute **immédiatement** le **soft-delete** (`deleted_at`, révocation des sessions,
  compte désactivé) et renvoie **202** avec `status = pending`.
- La **purge/anonymisation différée** est assurée par la **purge planifiée** déjà spécifiée (fenêtre RGPD
  ≤ 30 j). **Pas de table de jobs pour la suppression** : le `jobId`/202 est un accusé de réception.
- *Réserve* : si le contrat expose un `GET .../deletion/{jobId}` pollable, persister alors un état minimal
  de suppression (à arbitrer à la lecture du contrat).
- Distinguer **effacement vs anonymisation** selon TX-SEC-003 ; gérer les données dépendantes d'un coach
  supprimé (groupes, affectations) sans casser l'intégrité ni exposer de données de tiers.

### 3. Sécurité & observabilité (commun)

- URL de téléchargement **présignée et expirante**, sur HTTPS, jamais persistée en clair longue durée
  (on persiste seulement la clé objet `object_key`, l'URL est générée au GET).
- L'export ne contient **que les données de la personne** (jamais celles d'autres athlètes).
- Journalisation `data.export` et `account.deletion` dans `audit_log`.

## Conséquences

- **+** Ajout de la table `export_jobs` au modèle de données → **TX-DATA-006 §12 mis à jour** (cf. §12.1).
- **+** Nouvelle dépendance : stockage objet OVH (S3) + gestion des URL présignées.
- **+** La suppression reste conforme à la spec (divergence minimale).
- **+** Débloque TLX-033 puis TLX-034.
- **−** Introduit l'infra worker (BullMQ/Redis) — qui servira aussi aux futurs traitements asynchrones.

### Table `export_jobs` (ajout TX-DATA-006 §12)

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | = `jobId` exposé par l'API |
| `user_id` | uuid (fk users) | propriétaire ; `ON DELETE CASCADE` |
| `status` | text + CHECK `pending\|processing\|ready\|failed\|expired` | cycle de vie |
| `object_key` | text, nullable | clé de l'archive sur le stockage objet (rempli quand `ready`) |
| `expires_at` | timestamptz, nullable | expiration de l'archive |
| `error` | text, nullable | message si `failed` |
| `created_at` / `updated_at` | timestamptz | horodatage (trigger `set_updated_at`) |

Index : `(user_id, status)`. Unicité **partielle** « un seul export actif » :
`UNIQUE (user_id) WHERE status IN ('pending','processing')`.
*Ne pas stocker l'URL présignée : la générer au GET à partir de `object_key`.*

**Note de modélisation (écart assumé vis-à-vis de l'esquisse).** L'esquisse initiale utilisait un `enum`
Prisma natif `ExportStatus`. Le projet impose la convention **« énumérations = texte contraint par CHECK,
pas d'enum natif »** (cf. en-tête de `schema.prisma`, §2 de TX-DATA-006) pour faciliter l'évolution. On
retient donc `status TEXT` + contrainte `CHECK`, cohérent avec `users.role`, `consents.type`, etc.

## Alternatives écartées

- **Table générique `data_jobs` (export + suppression)** : rejetée pour le MVP — la suppression est déjà
  modélisée par soft-delete + purge ; une ligne de « job » de suppression n'apporte presque rien et
  complique le raisonnement. À reconsidérer si un statut de suppression pollable est exposé.
- **Export synchrone** : rejeté — risque de timeout et de blocage de requête sur un gros volume de données.
- **`enum` Prisma natif pour `status`** : rejeté pour rester homogène avec la convention CHECK du schéma.
