# ADR-20 — Records personnels : table matérialisée + détection de PB à la soumission

- **Statut :** Proposé
- **Date :** 2026-06-10
- **Complète :** `Talent-X_06_Modele_de_donnees.md` (nouvelle table `personal_records`),
  `talent-x-openapi.yaml` (schéma `PersonalRecord`, endpoints records, réponse de
  soumission de perf)
- **Tickets liés :** TLX-076 (détection de record PB + proposition de mise à jour,
  A-04 §7) — **bloqué par cet ADR** ; TLX-091 (écran Records personnels A-07) en dépend.
- **Réf. :** ADR-19 (mesures typées `timeSeconds`/`distanceMeters` — prérequis),
  ADR-17 (méthode : contrat explicite des dérivations), CLAUDE.md règle 7.

## Contexte

TLX-076 demande : à la soumission d'une perf, **détecter un record personnel** (PB) et
**proposer sa mise à jour** ; TLX-091 demande un écran « Records personnels » (A-07).
Or ni TX-DATA-006 ni l'OpenAPI ne définissent de notion de record : aucune table, aucun
schéma, aucun endpoint. Les mesures nécessaires existent depuis l'ADR-19 (`timeSeconds`,
`distanceMeters` par essai dans `results` v2), mais il manque trois décisions :

1. **Identité d'une épreuve** : un PB se compare « à épreuve égale » (60 m ≠ 100 m ;
   longueur ≠ triple saut). Les perfs rattachent les mesures à des blocs au nom libre.
2. **Stockage** : record **matérialisé** (table) ou **dérivé** à la lecture (agrégat sur
   les JSONB `results`) ?
3. **Rôle de l'athlète** : mise à jour automatique ou **sur confirmation** (« proposition
   de mise à jour » du backlog) ?

## Décision (proposée)

**1. Clé d'épreuve dérivée des blocs typés (ADR-18).** Une épreuve est identifiée par
`event_key` calculée côté backend à partir du bloc :

| `BlockType` | `event_key` | Mesure | Sens |
|---|---|---|---|
| `sprint`, `hurdles`, `endurance`, `interval` | `{type}:{params.distanceMeters}m` (ex. `sprint:60m`) | `timeSeconds` (min de la perf) | **min** |
| `jumps` | `jumps` (MVP : sans sous-type) | `distanceMeters` (max) | **max** |
| `throws` | `throws:{params.implementKg}kg` (ex. `throws:7.26kg`) | `distanceMeters` (max) | **max** |

Bloc sans `params.distanceMeters` (course) ou sans mesure → pas de candidat record.
Essai `failed` → ignoré. Les types non mesurés (`strength`, `core`, etc.) sont hors champ.

**2. Table `personal_records` matérialisée** (TX-DATA-006, nouvelle section) :
`id, athlete_id (FK users), event_key, label (libellé affichable, ex. « 60 m »), value
(numeric), unit ('s'|'m'), direction ('min'|'max'), achieved_at (date), performance_id
(FK nullable — null si record déclaré manuellement), created_at, updated_at` ; unicité
`(athlete_id, event_key)`. Donnée de santé au sens du projet → mêmes portes que les
perfs : écriture athlète (`data_processing`), lecture coach (`coach_access` + lien actif),
incluse dans l'export et l'effacement RGPD (ADR-14/15).

**3. Détection à la soumission, mise à jour sur confirmation de l'athlète.**
`POST/PUT /assignments/:id/performance` calcule les candidats (meilleure mesure de la
perf par `event_key` strictement meilleure que le record courant, ou épreuve sans record)
et les renvoie dans la réponse : `recordCandidates: [{ eventKey, label, value, unit,
previousValue? }]` — champ **additif** sur le schéma `Performance`. L'athlète confirme
via `PUT /athletes/me/records/{eventKey}` (corps `{ performanceId }` ; le backend revalide
la mesure depuis la perf — pas de valeur libre sur ce chemin). Lecture :
`GET /athletes/me/records` (athlète) et `GET /athletes/{id}/records` (coach,
consent-gated). **Pas de mise à jour automatique** : un record est une donnée revendiquée
(vent, mesure officieuse, erreur de saisie) — l'athlète reste maître (esprit RGPD du
projet : l'athlète contrôle ses données).

## Conséquences

- **+** TLX-076 et TLX-091 (A-07) reposent sur le même socle ; l'écran A-07 lit une table
  propre au lieu d'agréger des JSONB.
- **+** Lectures O(1) par athlète, comparaison de PB triviale (`direction`), historique
  traçable (`performance_id`).
- **+** Extensible : un record **manuel** (perf hors app, compétition) = ligne avec
  `performance_id` null — l'écran A-07 (TLX-091) décidera de son éditeur.
- **−** Nouvelle table + migration + endpoints + portes consentement + manifestes
  export/effacement à étendre (ADR-14/15).
- **−** La clé d'épreuve dépend de la **qualité des `params`** saisis par le coach
  (distance manquante → pas de détection). Assumé : même philosophie défensive que
  TLX-062 (lecture tolérante, jamais d'erreur).
- **−** `jumps` sans sous-type agrège longueur et triple saut tant que le constructeur ne
  distingue pas les sauts horizontaux ; raffinable plus tard par un nouvel `event_key`
  (additif). La hauteur/perche attend TLX-075 (grille de barres).

## Alternatives écartées

- **Records dérivés à la lecture** (agrégat `MIN`/`MAX` sur les JSONB `results`) : pas de
  « proposition de mise à jour » possible (rien à confirmer), pas de records manuels
  (A-07 incomplet), scan des JSONB de toutes les perfs à chaque lecture, une faute de
  frappe (0.745 s) devient un record incontestable. Rejetée.
- **Mise à jour automatique du record à la soumission** : simple, mais retire le contrôle
  à l'athlète et propage les erreurs de saisie ; le backlog demande explicitement une
  « proposition ». Rejetée.
- **Clé d'épreuve saisie par le coach** (champ libre « épreuve » sur le bloc) : friction
  de saisie, doublons (« 60m » / « 60 m » / « sprint 60 ») ; la dérivation depuis les
  `params` typés est gratuite et normalisée. Rejetée pour le MVP (un libellé manuel
  pourra compléter, additif).
