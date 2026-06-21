## ADR-45 — Agrégat de présence par séance (compteur sans noms) — `GET /assignments/{id}/attendance-summary`

- **Statut :** Accepté (2026-06-21, validé d'office)
- **Date :** 2026-06-21
- **Complète :** ADR-43 §1 (axe `attendance`) et §5 (présence **agrégée** d'abord, identités sous AIPD).
- **Réf. :** ADR-43 (présence RSVP), ADR-30 (fan-out d'affectation par athlète), ADR-37 (vue pair minimisée), ADR-08 (RBAC + appartenance), `talent-x-openapi.yaml` (`Assignment`, `/assignments/{id}`), TLX-173.

**Contexte.** L'athlète déclare désormais sa présence (RSVP, ADR-43 §1), mais c'est un **geste
solitaire** : il ne voit pas l'élan du groupe. ADR-43 §5 autorise déjà l'exposition d'un **compteur
agrégé** de présence à l'athlète (« 9 présents · 1 absent · 2 sans réponse »), l'exposition
**nominative** restant hors MVP (AIPD). Il manque l'endpoint qui sert cet agrégat.

Question structurante : **sur quelle population** agréger, sans dépendre de la provenance de groupe
(Lot 2, ADR-30, non disponible) ? Réponse : sur la **séance**. Une séance affectée à un groupe est
fan-outée en une `SessionAssignment` par athlète (ADR-30) ; **toutes** partagent le même `sessionId`.
Agréger `attendance` sur `SessionAssignment WHERE session_id = X AND deleted_at IS NULL` donne donc
« qui fait cette séance et qui vient » — **sans** champ de provenance, **sans** Lot 2.

**Décision.**

### 1. Agrégat par séance, dérivé de l'axe `attendance`
Nouvel endpoint **`GET /assignments/{id}/attendance-summary`** (operationId `getAttendanceSummary`).
Il résout la séance depuis l'affectation du demandeur, puis **compte** les `attendance` de toutes les
affectations actives de cette séance :

```
AttendanceSummary = {
  going: int, notGoing: int, maybe: int, noResponse: int,  // noResponse = attendance NULL
  total: int                                                // going+notGoing+maybe+noResponse
}
```

Choisi **sur `/assignments/{id}`** (et non `/sessions/{id}`) : l'athlète atteint la séance par *son*
affectation ; l'autorisation réutilise alors la garde existante (titulaire de l'affectation) sans
nouveau calcul d'appartenance.

### 2. RGPD — compteur seul, jamais d'identités
La réponse ne porte **que des entiers** (ADR-43 §5, minimisation) : aucun `userId`, aucun nom, aucune
pile d'avatars (bloquée par l'AIPD, ADR-37/ADR-43 §5). L'agrégat décrit un **comportement collectif**,
pas des individus.

### 3. RBAC
**Athlète titulaire** de l'affectation **ou** **coach propriétaire** de la séance (même garde que
`GET /assignments/{id}`, ADR-08) ; **404 anti-énumération** sinon. Aucune fuite à un tiers non
concerné par la séance.

### 4. Front — ligne d'agrégat dans le détail de séance
Le détail unique (`SessionDetailScreen`, ADR-44 §4) affiche une **ligne d'agrégat** à côté du
contrôle de présence (« X présents · Y absents · Z sans réponse »), masquée quand elle n'a pas de
sens (`total ≤ 1`, séance individuelle). La déclaration de présence **rafraîchit** l'agrégat
(invalidation par préfixe `['assignment', id]`, déjà émise par `PresenceControl`, ADR-43 §1).

**Conséquences.**

- **Positives :** rend la présence **sociale** et motivante sans enfreindre le RGPD (agrégat, ADR-43
  §5) ni dépendre du Lot 2 ; **zéro migration** (réutilise `attendance`) ; surface de contrat minimale
  (un GET) ; autorisation réutilisée (aucune nouvelle règle d'appartenance).
- **Négatives / coûts :** un `groupBy` à la lecture (borné au nombre d'affectations d'une séance,
  négligeable) ; pour une séance affectée **individuellement** à plusieurs athlètes, l'agrégat révèle
  le **nombre** de co-affectés (jamais leur identité) — jugé acceptable (comportement agrégé,
  minimisation préservée) ; l'exposition **nominative** reste différée (AIPD).

**Alternatives considérées.**

- **Agréger par groupe** (`group_assignment_id`). Écarté : dépend de la provenance Lot 2 (ADR-30) non
  disponible ; l'agrégation par `sessionId` donne le même résultat utile sans ce couplage.
- **Endpoint sur `/sessions/{id}`.** Écarté : imposerait une garde d'appartenance/propriété dédiée ;
  l'athlète raisonne par *son* affectation, où la garde existe déjà.
- **Exposer la liste nominative des présents** (pile d'avatars de la maquette). Écarté : nouvelle
  visibilité comportementale pair-à-pair → **AIPD requise** (ADR-43 §5, ADR-37).
- **Calcul côté client** (lister les affectations d'autrui pour compter). Impossible : l'athlète n'a
  pas accès aux affectations des autres (et ne doit pas) — l'agrégat doit être calculé **serveur**.
