# ADR-19 — Schéma `results` v2 : mesures chronométriques et de distance par essai

- **Statut :** Proposé
- **Date :** 2026-06-10
- **Complète :** `Talent-X_06_Modele_de_donnees.md` §9.2 (contrat `results`),
  `talent-x-openapi.yaml` (schémas `SetResult`, `ExerciseResult`, `ResultsDoc`)
- **Tickets liés :** TLX-072 (saisie mode Temps, A-04 §4.1), TLX-073 (mode Intervalles,
  A-04 §4.2), TLX-074 (mode Série d'essais distance, A-04 §4.3) — **bloqués par cet ADR** ;
  TLX-075 (grille de barres, §4.4) en bénéficiera ; TLX-062 (cibles, livré) fournit la jointure
  bloc typé → affichage côté athlète.
- **Réf. :** CLAUDE.md règles 5 et 7, **ADR-18** (méthode : extension additive versionnée du
  JSONB), §9.3 versionnement.

## Contexte

Le contrat `results` **v1** (TX-DATA-006 §9.2), implémenté par
[`results.dto.ts`](../../apps/api/src/assignments/dto/results.dto.ts), ne porte par série que :

```jsonc
setResults[] : { set, reps?, load?{value,unit}, durationSeconds? (entier), completed? }
```

Or le backlog A-04 §4 prescrit des **modes de saisie par discipline** dont les mesures
n'existent pas dans v1 :

| Ticket | Mode | Mesures requises |
|--------|------|------------------|
| 072 | Temps (sprint / haies / demi-fond) | **temps décimal** par course (ex. 7.45 s) |
| 073 | Intervalles (fractionné / VMA) | temps décimal par répétition |
| 074 | Série d'essais distance (sauts / lancers) | **distance décimale** par essai (ex. 6.42 m) + essai raté/mordu |

`durationSeconds` est **entier** (durée tenue type gainage) : impossible d'y stocker un chrono
au centième sans en muter la sémantique v1. Aucun champ distance n'existe. Le `ValidationPipe`
global (`forbidNonWhitelisted`) rejette tout champ hors-DTO (400) — pas de stockage silencieux.

## Décision (proposée)

**Étendre `results` en v2 par ajout de mesures optionnelles sur `SetResult`** — même méthode
additive que l'ADR-18 :

- **`timeSeconds?: number`** (décimal ≥ 0) — temps **mesuré** de la course / répétition
  (sprint, haies, demi-fond, intervalles). Distinct de `durationSeconds` (entier, durée
  *tenue* héritée de v1, ex. gainage 45 s), dont la sémantique est inchangée.
- **`distanceMeters?: number`** (décimal ≥ 0) — distance **mesurée** de l'essai (sauts,
  lancers).
- **`failed?: boolean`** — essai raté / mordu (sauts, lancers) ; un essai `failed` porte
  généralement pas de `distanceMeters`.
- **`schemaVersion: 2`** par défaut pour les nouvelles performances
  (`results_schema_version` 2).

**Pas de discriminant `type` dans `results`.** Le **mode de saisie** est dérivé côté client du
`type` du bloc de séance (contrat `exercises` v2, ADR-18) ; la perf reste alignée sur la séance
par `exerciseName`/`order` comme en v1. Les mesures sont auto-descriptives — inutile de
dupliquer la discipline dans le document de résultats.

**Correspondance mode ↔ `BlockType` (côté client) :**

| Mode | `BlockType` | Saisie par série/essai |
|------|-------------|------------------------|
| Temps (072) | `sprint`, `hurdles`, `endurance` | `timeSeconds` |
| Intervalles (073) | `interval` | `timeSeconds` (nombre de lignes pré-rempli depuis `params.reps`, cf. TLX-062) |
| Essais distance (074) | `jumps`, `throws` | `distanceMeters` + `failed` |
| Checklist v1 (défaut) | `strength`, `custom`, `core`, `warmup`, `cooldown` | inchangé (`completed`, `reps`, `load`) |

**Rétro-compatibilité.** Tout document v1 est valide en v2 (champs nouveaux optionnels,
aucun champ v1 modifié). Aucune migration de données ; la lecture tolère v1 et v2 (§9.3).
L'écran de revue coach (C-08) affiche les mesures quand elles existent, sinon l'existant.

## Conséquences

- **+** La donnée de performance devient **mesurable et requêtable** (chrono, distance) →
  socle des modes A-04, de la progression athlète (A-06/07) et des stats coach.
- **+** Symétrie cibles ↔ résultats : le coach fixe `params` typés (ADR-18), l'athlète saisit
  des mesures typées — le pré-remplissage TLX-062 prend tout son sens (ex. 6 lignes de temps
  pour `interval.reps = 6`).
- **+** Migration **non bloquante**, méthode éprouvée par l'ADR-18 (OpenAPI ↔ DTO ↔ client
  orval régénéré).
- **−** Surface de validation étendue (3 champs optionnels, bornes ≥ 0) + tests par mode.
- **−** Mapping mode ↔ `BlockType` à maintenir côté front (registre, comme
  `BLOCK_TYPE_SPECS`).
- **−** La grille de barres (TLX-075, hauteur/perche) n'est volontairement **pas** couverte :
  ses essais à 3 tentatives par barre demanderont soit une convention (`distanceMeters` =
  hauteur + `failed` par tentative), soit un complément — à trancher avec TLX-075.

## Alternatives écartées

- **Tout mettre dans `comment` / notes libres** : lossy, non requêtable, casse la progression
  et la revue structurée. Rejetée (même motif qu'ADR-18).
- **Relâcher `durationSeconds` en décimal** pour y mettre les chronos : mute la sémantique
  d'un champ v1 (durée *prévue/tenue* ≠ temps *mesuré*) et crée une ambiguïté de lecture
  permanente. Rejetée au profit d'un champ dédié `timeSeconds`.
- **Conteneur libre `params` par série** (symétrie maximale avec ADR-18) : sur-générique pour
  trois mesures universelles de l'athlétisme ; la validation libre complique stats et
  progression. Rejetée au profit de champs plats typés.
- **Un schéma de résultats par discipline** : duplique la base commune, complique la liste
  hétérogène et la revue C-08. Rejetée (même motif qu'ADR-18).
