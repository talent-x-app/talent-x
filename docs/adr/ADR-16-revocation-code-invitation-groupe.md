# ADR-16 — Révocation du code d'invitation de groupe (colonne dédiée)

- **Statut :** Accepté
- **Date :** 2026-06-09
- **Complète :** TX-DATA-006 §5.1 (`groups.invite_code`)
- **Tickets liés :** TLX-041 (`/groups` + gestion des membres)
- **Réf. :** `talent-x-openapi.yaml` (`manageInviteCode`, schémas `InviteCode`/`Group`),
  TX-DATA-006 §5.1, ADR-12 (migrations expand-contract)

## Contexte

Le contrat d'API (`manageInviteCode`) définit une action **`revoke`** qui renvoie
`InviteCode { inviteCode: null }` : un code révoqué devient **inutilisable** et
n'est plus exposé. Or **TX-DATA-006 §5.1** fige `groups.invite_code` en **`NOT NULL,
UNIQUE`** (« Code d'adhésion »). Les deux sources de vérité se contredisent sur la
révocation : on ne peut pas à la fois garantir `NOT NULL` et représenter l'absence
de code par `NULL`. Cette divergence doit être tranchée avant d'implémenter
`manageInviteCode` (CLAUDE.md règle 7).

## Décision

Conserver `groups.invite_code` **`NOT NULL, UNIQUE`** (fidèle à TX-DATA-006) et
ajouter une colonne d'**état de révocation** :

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `invite_code_revoked_at` | timestamptz | NULL | Horodatage de révocation ; `NULL` = code actif |

- **`regenerate`** : nouveau code unique (`invite_code`), `invite_code_revoked_at → NULL`.
  Réponse `InviteCode { inviteCode: <nouveau> }`.
- **`revoke`** : `invite_code_revoked_at → now()` (le code stocké reste en base, NOT
  NULL préservé). Réponse `InviteCode { inviteCode: null }` — **la couche API masque
  le code** quand `invite_code_revoked_at IS NOT NULL`.
- **`joinGroup`** : n'accepte que les codes **actifs** — `WHERE invite_code = ? AND
  deleted_at IS NULL AND invite_code_revoked_at IS NULL` ; sinon **404** (code
  invalide/révoqué, sans fuite d'existence).
- **Projection `Group.inviteCode`** : exposé au coach propriétaire ; `null` si révoqué.

Migration **expand-only** (ADR-12) : ajout d'une colonne nullable, sans réécriture
ni rupture de compatibilité.

## Conséquences

- **+** Invariant `NOT NULL, UNIQUE` de TX-DATA-006 **préservé** ; aucune divergence
  de contrainte sur le modèle de données.
- **+** Sémantique du contrat respectée (`revoke → inviteCode: null`) via masquage
  applicatif.
- **+** **Auditable** : la révocation est horodatée (cohérent avec l'historisation
  RGPD du domaine — `left_at`, `ended_at`, `revoked_at`).
- **+** Réversible : `regenerate` réactive proprement (nouveau code + reset).
- **−** Une colonne de plus ; la projection API doit penser à masquer le code révoqué
  (centralisé dans le service, couvert par les tests).

## Alternatives écartées

- **Rendre `invite_code` nullable** (revoke = `NULL`) : fidèle à la sémantique du
  contrat mais **diverge de TX-DATA-006** (perte de l'invariant « toujours un code »)
  et complique l'unicité (multiples `NULL`). Rejetée : on complète le modèle plutôt
  que de contredire une contrainte figée.
- **Revoke = rotation silencieuse** (nouveau code non communiqué) : ne satisfait pas
  le contrat (qui renvoie `null`) et laisse un code valide en circulation. Rejetée.
