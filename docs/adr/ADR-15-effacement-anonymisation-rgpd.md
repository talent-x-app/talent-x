# ADR-15 — Manifeste d'effacement / anonymisation RGPD

- **Statut :** Accepté
- **Date :** 2026-06-09
- **Complète :** ADR-05 (RGPD transversal), ADR-13 (jobs asynchrones RGPD — §2 suppression)
- **Tickets liés :** TLX-034 (DELETE /users/me + purge planifiée)
- **Réf. :** TX-SEC-003 §9.2 (processus d'effacement), TX-DATA-006 (modèle), ADR-13 §2, `talent-x-openapi.yaml`

## Contexte

`DELETE /users/me` exerce le **droit à l'effacement** (art. 17 RGPD). ADR-13 §2 fixe l'architecture :
**soft-delete immédiat** (`deleted_at`) puis **purge/anonymisation différée** par tâche planifiée,
**sans table de jobs** (le `jobId`/202 est un accusé de réception ; aucun GET pollable au contrat).
Restent à figer, comme pour l'export (ADR-14), le **contenu** de la purge et la **frontière
effacement vs anonymisation** : effacer les données personnelles **sans casser l'intégrité
référentielle** (un coach est référencé par ses groupes/séances via FK `onDelete: Restrict`) ni
détruire les données nécessaires à la défense juridique (consentements) ou à l'investigation
(journal d'audit). Cet ADR fige ce manifeste.

## Décision

### 1. Phase immédiate — `DELETE /users/me`

En transaction : `deleted_at = now` ; révocation de tous les `refresh_tokens` et `device_tokens`
(`revoked_at`) ; entrée `audit_log` `account.deletion`. Réponse **202** `Job { jobId, status:
'pending' }` où `jobId` est un **identifiant synthétique non persisté** (accusé). Idempotent : un
compte déjà supprimé renvoie quand même 202.

> Effet immédiat : `login`/`refresh` filtrent `deleted_at IS NULL` → le compte est inaccessible
> aussitôt ; l'access token résiduel expire en ≤ 15 min (backend stateless, ADR-06). L'index unique
> partiel `lower(email) WHERE deleted_at IS NULL` libère immédiatement l'e-mail.

### 2. Phase différée — purge après rétention

Fenêtre `ACCOUNT_PURGE_RETENTION_DAYS` (défaut **30 j**, alignée sur la rétention des sauvegardes,
TX-SEC-003 §9.2). Tâche planifiée (worker, `@Cron`). Par utilisateur expiré, en transaction :

| Donnée | Action | Justification |
|---|---|---|
| `users` (ligne) | **Anonymiser** : `email → deleted-<id>@anonymized.invalid`, prénom/nom → « Utilisateur »/« supprimé », `sport/bio/photo_url/birth_date → null`, `password_hash → ''`, `two_factor_secret → null`, `two_factor_enabled → false` | FK `Restrict` (coach→groupes/séances) interdit la suppression ; on retire les PII |
| `performances` (de l'athlète) | **Supprimer** | données perso (résultats, notes) |
| `group_members`, `coach_athlete_links` (du user) | **Supprimer** | données de relation |
| `device_tokens`, `refresh_tokens`, `export_jobs` | **Supprimer** | artefacts techniques |
| `comments` rédigés par le user | **Scrub** `body → « [contenu supprimé] »` | intégrité des fils, retrait du contenu |
| `consents` | **Conserver** | preuve de base légale (art. 7(1)) |
| `audit_log` | **Conserver** | investigation ; le lien `actor_id` devient anonyme |
| `groups`, `sessions` (créés par un coach) | **Conserver** | intégrité des athlètes ; contenu d'entraînement |
| `audit_log` `account.purge` | **Écrire** | traçabilité de la purge |

### 3. Idempotence & sélection (sans migration)

Le suffixe d'e-mail `@anonymized.invalid` sert de **marqueur « déjà purgé »** : aucune colonne
ajoutée. Candidats à la purge :
`deleted_at <= now − rétention` **ET** `email NOT LIKE '%@anonymized.invalid'`.

## Conséquences

- **+** Effacement réel et complet des PII, intégrité référentielle préservée, conformité tracée.
- **+** Aucune migration (marqueur porté par l'e-mail anonymisé).
- **−** La ligne `users` survit (anonymisée) même pour un athlète sans dépendance : choix d'uniformité
  (un seul chemin, moins de risque) plutôt que suppression en cascade conditionnelle.
- **−** Le manifeste doit être **mis à jour à chaque nouvelle entité** portant des PII (garde-fou en
  revue de schéma).

## Alternatives écartées

- **Suppression en dur conditionnelle** (athlète en cascade, coach anonymisé) : rejetée — deux chemins
  divergents, comportement asymétrique, risque d'erreur supérieur.
- **Colonne `anonymized_at` dédiée** : rejetée pour le MVP — le marqueur e-mail suffit et évite une
  migration ; à reconsidérer si un état de purge plus riche devient nécessaire.
- **Purge synchrone à la demande** : rejetée — incompatible avec la fenêtre de rétention des
  sauvegardes et le contrat asynchrone (202).
