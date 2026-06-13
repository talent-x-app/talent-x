## ADR-33 — Historisation des corrections de performance : trace d'audit avant/après (RB-06)

- **Statut :** Accepté (validé 2026-06-13)
- **Date :** 2026-06-13
- **Décisions validées :** (1) mécanisme = **`audit_log` enrichi** (vs table `performance_revisions`) ; (2) **pas** de vue coach de l'historique des corrections au MVP (trace de conformité, pas fonctionnalité) ; (3) **records (ADR-20) inchangés** — une correction ne mute jamais un PB.
- **Réf. :** Linear TLX-110 · RB-06 (TX-SPEC-002 §, « l'historique ne doit jamais être modifié sans trace » / « horodatage et journaux d'audit sur les opérations sensibles ») · `assignments/performances.service.ts` (`updatePerformance`) · `audit_log` (TX-DATA-006) · ADR-15 (manifeste d'effacement) · ADR-20/32 (records) · ADR-09 (jobs/purge)

**Contexte.** `PerformancesService.updatePerformance` réécrit la performance **en place**
(`prisma.performance.update`, `performances.service.ts:137`) : `results`, `rpe`, `notes` sont
écrasés sans conserver la valeur précédente. La règle métier **RB-06** — « l'historique ne doit
jamais être modifié sans trace » — n'est donc **pas honorée** : un athlète qui corrige une marque
(faute de frappe `7.45` → `7.60`, RPE corrigé, notes amendées) efface silencieusement la version
antérieure. Aucune reconstitution possible, aucun horodatage du *qui/quand/quoi*. C'est le seul
chemin d'écriture destructif d'une donnée d'historique de l'app (la soumission initiale, elle, ne
détruit rien ; les affectations et records suivent déjà des conventions traçables — soft-delete,
append-only). Le ticket exige un ADR (CLAUDE.md §7) car le **mécanisme de traçabilité** et ses
deux corollaires (visibilité coach, impact records) sont des choix de modèle de données non figés
par les specs.

**Décision.**

### 1. Mécanisme — enrichir `audit_log` (pas de table de versions)

Chaque correction écrit une entrée dans la table **`audit_log` existante** (append-only par
convention, déjà utilisée pour `account.deletion`/`account.purge`) :

```
audit_log {
  actorId    = athlète titulaire (seul autorisé à corriger)
  action     = 'performance.correction'
  entityType = 'performance'
  entityId   = performance.id
  metadata   = { before: { results, resultsSchemaVersion, rpe, notes },
                 after:  { results, resultsSchemaVersion, rpe, notes } }
  createdAt  = now()
}
```

L'écriture de la trace et la mise à jour de la performance se font dans **une même
transaction** (`$transaction`) : la trace est aussi durable que la modification — il est impossible
de muter la perf sans laisser la trace, ou l'inverse. Une entrée est écrite **à chaque correction
appliquée** (PUT qui modifie effectivement au moins un champ ; un PUT idempotent identique n'écrit
pas de trace vide).

Choisi **contre** une table dédiée `performance_revisions` (append-only versionnée) : `audit_log`
existe déjà, est le mécanisme **désigné par le texte même de RB-06** (« journaux d'audit sur les
opérations sensibles »), porte déjà acteur + horodatage + `metadata` JSON + index `entity`, et
**ne demande aucune migration**. Une table de versions n'est justifiée que par un besoin de
**reconstruction/affichage d'une timeline riche** (ou de *revert*) — hors périmètre RB-06, qui
demande une *trace*, pas un historique navigable. C'est la voie d'escalade documentée si une
« vue historique des marques » devenait un besoin produit (la trace `audit_log` permettrait même
de l'alimenter rétroactivement).

### 2. Visibilité coach — différée (aucune UI/endpoint au MVP)

La trace est un artefact de **conformité**, pas une fonctionnalité. Le coach continue de voir la
**valeur courante** (corrigée) de la performance ; **aucun** nouvel endpoint ni écran n'expose
l'historique des corrections dans ce ticket. Exposer « l'athlète a corrigé sa marque de A vers B »
est une décision de **transparence produit** distincte, qui peut être ajoutée plus tard de façon
**additive** (un `GET` lisant `audit_log` filtré `entityType='performance'` + `entityId`), et qui
touche la confidentialité de l'athlète sur ses propres corrections — à trancher à part. Zéro
changement de contrat OpenAPI, zéro régénération du client.

### 3. Impact records (ADR-20) — inchangé, le PB reste souverain à l'athlète

Un `PersonalRecord` stocke sa **propre valeur** (snapshot revalidé au moment du `confirm`) et un
FK `performanceId` : corriger une performance **ne touche pas** le PB. On **assume** ce
découplage plutôt que de muter automatiquement un record :

- Principe ADR-20/32 : la mise à jour d'un record est **toujours à l'initiative de l'athlète**
  (« valeur revalidée », « jamais de valeur libre » côté `confirm`). Auto-réécrire un PB depuis une
  édition de perf violerait ce principe et pourrait **détruire silencieusement** un record
  légitime.
- Le filet existant suffit au cas « correction vers le **mieux** » : la réponse du PUT rejoue déjà
  `detectCandidates` (`withRecordCandidates`) → si la marque corrigée bat le record courant,
  l'athlète se voit reproposer le candidat à confirmer.
- Cas-limite **assumé** : une marque corrigée **vers le bas** alors qu'un PB pointe encore cette
  perf laisse un PB « optimiste ». L'athlète le corrige via le record manuel (ADR-32, `POST` qui
  remplace) ou en re-confirmant. Surfacer activement « un record est lié à une perf corrigée » est
  un **suivi possible** (notice/candidat), hors périmètre. **ADR-20 et ADR-32 restent intacts.**

### 4. RGPD — la trace est purgée avec le compte (ADR-15)

`metadata.before/after` contient les **marques de l'athlète** = donnée personnelle. Le job de purge
(`AccountPurgeService.purgeUser`, ADR-15) efface aujourd'hui `performances`/`personal_records` mais
**pas** `audit_log` : sans action, les marques survivraient à l'effacement. La purge est donc
**étendue** pour neutraliser le contenu personnel de ces traces tout en gardant le squelette
d'audit (acteur déjà anonymisé, horodatage) :

```
auditLog.updateMany({ where: { actorId: userId, action: 'performance.correction' },
                      data: { metadata: null } })
```

(L'acteur d'une correction est **toujours** l'athlète titulaire — le filtre `actorId` est exact.)
Ajouté à la transaction de `purgeUser`. Cohérent avec ADR-15 (on conserve la ligne d'audit
anonymisée, on retire la charge personnelle).

### 5. Modèle — inchangé (zéro migration)

`audit_log` a déjà toutes les colonnes nécessaires (`actor_id`, `action`, `entity_type`,
`entity_id`, `metadata` JSONB, `created_at`, index `ix_audit_entity`). Aucune migration.

**Conséquences.**

- **Positives :** RB-06 honorée (trace atomique avant/après, acteur, horodatage) ; **zéro
  migration**, zéro changement de contrat, zéro impact client/mobile ; réutilise le mécanisme
  d'audit existant et le principe « records à la main de l'athlète » ; effacement RGPD couvert.
- **À assumer :** la trace n'est pas navigable (pas de timeline UI) — choix délibéré (RB-06 =
  traçabilité, pas historique produit) ; un PB peut rester « optimiste » après une correction vers
  le bas jusqu'à action de l'athlète (cas-limite, suivi possible).
- **Écartées :** (a) table `performance_revisions` versionnée — surdimensionnée pour une *trace*,
  migration + modèle + code sans besoin de reconstruction ; (b) vue coach des corrections — décision
  de transparence distincte, additive plus tard ; (c) auto-mutation/invalidation du PB sur
  correction — violerait la souveraineté athlète d'ADR-20 et pourrait détruire un record légitime ;
  (d) trace hors transaction — risquerait une mutation sans trace (rejetée frontalement par RB-06).

**Périmètre de livraison (après acceptation).**
`performances.service.ts` (`updatePerformance` : charge le snapshot *before*, écrit
`performance.update` + `auditLog.create('performance.correction')` dans un seul `$transaction`,
trace uniquement si un champ change) → `account-purge.service.ts` (scrub `metadata` des traces de
correction de l'athlète, dans la transaction de purge) → tests : unit service (trace avant/après
écrite + transactionnelle ; PUT identique → pas de trace), intégration DB-backed (correction →
ligne `audit_log` persistée avec before/after ; purge → `metadata` neutralisé), unit purge. **Aucun
changement OpenAPI / DTO / client.**
