# ADR-14 — Manifeste d'export RGPD & frontière des données de tiers

- **Statut :** Accepté
- **Date :** 2026-06-09
- **Complète :** ADR-05 (RGPD transversal), ADR-13 (jobs asynchrones RGPD)
- **Tickets liés :** TLX-033 (endpoints export + builder réel)
- **Réf. :** TX-SEC-003 §9.1 (processus d'export), ADR-13 §3 (sécurité), TX-DATA-006 (modèle), `talent-x-openapi.yaml`

## Contexte

`POST /users/me/export` produit une archive des données de la personne (worker, ADR-13). Les specs
(TX-SEC-003 §9.1) imposent un « export structuré des données de la personne » mais **n'énumèrent
pas** son contenu. Or ce contenu est un point structurant **à fort enjeu de conformité** : il doit
être complet vis-à-vis du droit d'accès/portabilité (art. 15/20 RGPD) **sans exposer ni secret ni
donnée d'un tiers** (ADR-13 §3 : « l'export ne contient que les données de la personne, jamais
celles d'autres athlètes »). Cet ADR fige le **manifeste d'export** et la **frontière des tiers**,
pour qu'ils restent défendables (DPIA, contrôle CNIL) et stables dans le temps.

## Décision

### 1. Enveloppe

Archive **JSON** unique :
`{ schemaVersion, generatedAt, subject: { userId, role }, scope, data: { …sections… } }`.
`schemaVersion` versionne le format (évolutif) ; `scope` rappelle en clair la limite « données de
tiers exclues ».

### 2. Exclusions systématiques (tous rôles)

- **Secrets** : `password_hash`, `two_factor_secret` (on conserve le booléen `two_factor_enabled`).
- **Artefacts d'authentification** : `refresh_tokens` (intégralement) ; **valeur** des
  `device_tokens` (on expose seulement plateforme + horodatages, pour transparence sans livrer un
  identifiant exploitable).

### 3. Sections communes

`profile`, `consents`, `deviceTokens` (sans valeur), `exportRequests` (historique des jobs),
`auditTrail` (`audit_log` où `actor_id = user` ; **sans** la PK `BigInt`, non sérialisable JSON et
sans valeur pour la personne), `commentsAuthored` (commentaires **rédigés par** l'utilisateur).

### 4. Sections par rôle

- **Athlète** : `groupMemberships` (nom du groupe + dates), `coachLinks` (source, dates + **nom**
  du coach), `assignments` (statut/dates + contenu de la séance affectée), `performances` (résultats,
  RPE, notes — données propres).
- **Coach** : `coachedGroups` (métadonnées + **nombre** de membres), `coachedSessions` (séances
  créées), `coachAthleteLinks` (source, dates, groupId).

### 5. Frontière des données de tiers (décisions assumées)

- **Feedback reçu exclu.** Les commentaires rédigés par autrui (ex. le coach) sur les performances
  d'un athlète **ne sont pas** inclus : contenu produit par un tiers. *Limite assumée vs une lecture
  art. 15 maximaliste ; réévaluable si une demande d'accès l'exige (réponse manuelle possible).*
- **Identités d'athlètes exclues de l'export coach.** Les objets exportés côté coach ne portent
  **aucune identité** d'athlète (ni nom, ni e-mail, ni UUID) — au plus un agrégat (nombre de
  membres). Conforme à ADR-13 §3.
- **Nom du coach inclus côté athlète.** Le coach est le **counterparty direct** de la relation
  d'entraînement de l'athlète ; son nom (sans e-mail) est inclus comme contexte essentiel de la
  donnée de l'athlète. *Choix assumé.*

### 6. Sécurité & traçabilité

- L'URL de téléchargement est **présignée, générée au GET**, jamais persistée (ADR-13 §3).
- Toute demande d'export écrit une entrée `audit_log` `data.export` (`actor_id`, `entity = export_job`).

## Conséquences

- **+** Contenu d'export défini, complet et **non fuitant** ; base de conformité tracée.
- **+** `schemaVersion` autorise l'évolution sans rupture.
- **−** Le « feedback reçu » exclu peut nécessiter une réponse manuelle en cas de demande d'accès
  explicite portant dessus.
- **−** Le manifeste doit être **mis à jour à chaque nouvelle entité** du modèle portant des données
  personnelles (garde-fou à porter dans la revue de schéma).

## Alternatives écartées

- **Export brut de toutes les lignes liées au `user_id`** : rejeté — exposerait secrets, jetons et
  données de tiers (commentaires/identités).
- **Inclure les identités d'athlètes côté coach** : rejeté — viole ADR-13 §3.
- **Archive ZIP multi-fichiers** : repoussé — un seul JSON suffit au MVP ; le ZIP pourra venir si le
  volume ou des médias binaires le justifient (le `contentType`/extension de clé objet le permettent).
