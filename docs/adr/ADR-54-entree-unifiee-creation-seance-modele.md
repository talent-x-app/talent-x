# ADR-54 — Entrée unifiée de création : modèle = même grammaire d'entrée que séance

- **Statut :** Accepté (2026-06-27, validé)
- **Date :** 2026-06-27
- **Amende / complète :** **ADR-38** (entrée de création par **sélecteur de discipline** +
  assistants guidés, `NewSessionScreen`), **ADR-29** (modèle = `Session` statut `template`,
  non daté, non assignable). Réutilise ADR-39/41/42/52 (cartes d'effort, grammaire de série).
- **Réf. :** rapport de test manuel coach `apps/mobile/e2e/RAPPORT_TEST_MANUEL_COACH.md` (R17).
  CLAUDE.md règle 7 (changement de navigation structurant → ADR avant code).
- **Tickets liés :** TLX-197 (date picker, livré) en amont du même sweep ; ce périmètre = TLX-197 suite (R17).

## Contexte

Un **modèle** est, par ADR-29, **une séance de statut `template`** (non datée, non assignable).
Pourtant les deux entrées de création divergent :

| | « Créer une séance » | « Créer un modèle » |
|---|---|---|
| Route | `session/new` (sans param) | `session/new?status=template` |
| Écran | `NewSessionScreen` — **sélecteur de discipline** (6 assistants guidés ADR-38 + « Composer ») | **direct** dans `SessionBuilderScreen` brut |

Conséquence : un coach qui crée un **modèle** est **privé des assistants par discipline**
(ADR-38/39/41) et tombe sur le canvas composite nu. Incohérence relevée en test manuel (R17) :
« Créer une séance » et « Créer un modèle » devraient suivre la **même logique d'entrée**.

Constat clé : `SessionBuilderScreen` gère **déjà** le mode modèle de bout en bout (masque la date
et l'assignation, sauve en `template`, `onSuccess` → bibliothèque de modèles, ADR-29). **Le défaut
est uniquement sur l'entrée**, pas sur le constructeur.

## Décision

### D1 — `NewSessionScreen` devient l'entrée **unique**, paramétrée par le statut cible

Le sélecteur de discipline (ADR-38) est rendu **pour les deux** intentions. Un paramètre
`asTemplate` (dérivé de `status=template` dans l'URL) adapte :

- le **titre** : « Nouvelle séance » → « Nouveau modèle » (+ sous-titre cohérent) ;
- les **cibles de navigation** des cartes : elles propagent `status=template` (cf. D2).

Aucune duplication d'écran : une seule grammaire d'entrée (6 disciplines + « Composer »).

### D2 — Les hrefs de création transportent le statut cible

- `disciplineAssistantHref(discipline, asTemplate?)` ajoute `status=template` quand `asTemplate`.
- `customSessionHref(asTemplate?)` ajoute `status=template` quand `asTemplate`.
- `newTemplateHref()` **ne mène plus directement au builder** : il pointe sur l'entrée
  `session/new?status=template` (donc sur le **sélecteur de discipline** en mode modèle).

### D3 — Aiguillage de la route `session/new`

`new.tsx` :

- `mode=custom` (± `status=template`) → `SessionBuilderScreen` (option « Composer »), avec
  `initialStatus=template` si demandé ;
- `status=template` **seul** (sans `mode`) → `NewSessionScreen` en **mode modèle** ;
- défaut → `NewSessionScreen` en mode séance.

> Changement de comportement : `status=template` seul ouvre désormais le **picker**, non le builder.

### D4 — L'assistant par discipline accepte le statut cible

La route `session/assistant/[discipline].tsx` lit `status` et le passe à
`DisciplineAssistantScreen`, qui le forwarde au `SessionBuilderScreen` via `initialStatus`. Le
constructeur fait **déjà** le reste (pas de date, sauvegarde `template`, retour bibliothèque) — donc
un modèle peut être amorcé par **n'importe quel assistant discipline**, exactement comme une séance.

### D5 — Invariants

**Zéro backend, zéro contrat touché.** Un modèle reste un `Session` `status:template` (ADR-29) ;
l'assistant reste une mince surcouche du constructeur (ADR-38) → la séance/modèle produit·e demeure
**éditable en C-05 sans perte**. Aucune migration.

## Conséquences

- **+** Cohérence : « Créer une séance » et « Créer un modèle » suivent la **même entrée** ; les
  assistants par discipline deviennent disponibles **aussi** pour les modèles.
- **+** Surface de code réduite : une seule entrée paramétrée plutôt que deux chemins.
- **−** `newTemplateHref` change de cible (picker au lieu du builder) — un écran de plus avant le
  canvas pour un modèle, assumé (c'est le but : exposer les assistants).
- **−** Câblage de `status` à travers picker → hrefs → route assistant → builder ; tests à adapter.

## Alternatives écartées

- **Garder deux entrées et juste « moderniser » le builder de modèle.** Rejeté : ne corrige pas
  l'incohérence d'entrée ; les assistants resteraient absents pour les modèles.
- **Dupliquer un `NewTemplateScreen`.** Rejeté : duplication inutile ; `NewSessionScreen`
  paramétré couvre les deux à coût marginal.
- **Choix séance/modèle dans le picker (un toggle).** Rejeté pour l'instant : l'intention est déjà
  portée par l'entrée appelante (bouton « Nouvelle séance » vs « Créer un modèle ») ; un toggle
  ajouterait une décision redondante.

## Plan (additif, testé, zéro backend)

1. `navigation.ts` : `disciplineAssistantHref`/`customSessionHref` prennent `asTemplate?` ;
   `newTemplateHref` pointe sur le picker en mode modèle.
2. `NewSessionScreen` : prop `asTemplate` (titre + propagation aux cartes).
3. `new.tsx` : aiguillage D3.
4. `session/assistant/[discipline].tsx` + `DisciplineAssistantScreen` : lire/forwarder `status`.
5. Tests : `NewSessionScreen` (mode modèle → hrefs portent `status=template`), route d'aiguillage,
   assistant en mode modèle ; E2E « créer un modèle via un assistant ».
