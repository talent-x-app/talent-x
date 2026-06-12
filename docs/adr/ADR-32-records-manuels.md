## ADR-32 — Records manuels : composition d'épreuve + endpoint à valeur libre (complément ADR-20)

- **Statut :** Accepté (validé 2026-06-12)
- **Date :** 2026-06-12
- **Décisions produit validées :** (1) endpoint **POST structuré** `/athletes/me/records` (le serveur compose la clé + dérive unité/sens) ; (2) écriture = **remplace** (déclaration/correction, sans garde « doit améliorer »).
- **Réf. :** Linear TLX-116 · ADR-20 (records personnels, `personal_records`, `performance_id` nullable) · ADR-18/19 (blocs typés, mesures) · `progress/record-detection.ts` (`eventForExercise`) · `talent-x-openapi.yaml` (`PUT /athletes/me/records/{eventKey}`, `PersonalRecord`) · TLX-076/091/112 (records livrés + câblés athlète/coach)

**Contexte.** Le socle records (ADR-20) matérialise `personal_records` (unicité athlète × épreuve,
`performance_id` **nullable** pour les records hors app) et expose la **confirmation depuis une
performance** (`PUT /athletes/me/records/{eventKey}` avec `{ performanceId }`, valeur **revalidée**
côté serveur depuis la perf — jamais de valeur libre). Le badge « manuel » (`performanceId == null`)
est déjà rendu (TLX-091/112). Mais **aucun endpoint n'écrit une valeur libre** : un athlète qui arrive
avec 10 ans de marques ne peut pas **initialiser ses PB**, et personne ne peut **corriger** une marque
erronée. Le ticket prévoit explicitement un complément additif au contrat → ADR (CLAUDE.md §7).

**Contrainte structurante.** L'espace des `eventKey` est **paramétrique et ouvert**, dérivé des blocs
typés (`eventForExercise`, ADR-20) : `sprint:{d}m`, `hurdles:{d}m`, `endurance:{d}m`, `interval:{d}m`
(unité **s**, sens **min**) ; `throws:{kg}kg`, `jumps`, `vertical:high`, `vertical:pole` (unité **m**,
sens **max**). Il n'existe **pas de catalogue fixe** (distances et poids d'engin sont libres). Un record
manuel **doit produire exactement la même clé** qu'un record auto-détecté pour la même épreuve (sinon
deux records concurrents pour « 60 m »). L'**unité et le sens** d'une épreuve ne sont pas un choix du
client : ils découlent de la famille. C'est le point que l'ADR fige.

**Décision.**

### 1. Un composeur d'épreuve canonique, miroir de la détection

Module pur `progress/manual-event.ts` : `eventForManual(family, param) → { eventKey, label, unit,
direction } | error`. Il **réutilise la même logique** que `eventForExercise` (même clé, même libellé,
même unité/sens), à partir d'une saisie structurée :

```
family ∈ { sprint, hurdles, endurance, interval, jumps, vertical, throws }
  sprint|hurdles|endurance|interval → param.distanceMeters (entier > 0)  → "{family}:{d}m"  · s · min
  throws                            → param.implementKg   (nombre > 0)    → "throws:{kg}kg"  · m · max
  vertical                          → param.discipline ∈ {high, pole}     → "vertical:{disc}" · m · max
  jumps                             → (aucun param)                       → "jumps"          · m · max
```

Toute autre famille / paramètre invalide → **422** (`INVALID_EVENT`). Le serveur est **seul** maître de
`unit`/`direction`/`label` (le client ne les envoie jamais). `record-detection.ts` est légèrement
refactoré pour partager la fabrique de clé (une seule source de vérité épreuve → clé).

### 2. Contrat — `POST /athletes/me/records` (valeur libre), additif

Nouvel endpoint **structuré** (l'athlète décrit l'épreuve, le serveur compose la clé) :

```
POST /athletes/me/records
ManualRecordRequest = {
  family: 'sprint'|'hurdles'|'endurance'|'interval'|'jumps'|'vertical'|'throws',
  distanceMeters?: int>0,        // requis pour les familles chronométrées
  implementKg?:    number>0,     // requis pour throws
  discipline?:     'high'|'pole',// requis pour vertical
  value:           number>0,     // la marque (s ou m selon l'unité dérivée)
  achievedAt?:     date          // défaut : aujourd'hui
}
→ 200 PersonalRecord (performanceId = null → « manuel »)
  422 INVALID_EVENT (famille/param incohérents) ; 422 validation (value ≤ 0, date future)
```

Choisi **contre** une extension de `PUT /{eventKey}` (qui imposerait de **parser** `eventKey` côté
serveur pour retrouver unité/sens — fragile, et expose une clé interne comme entrée). Le `PUT` existant
(confirmation depuis perf, valeur revalidée) **reste inchangé**. Porte de consentement
`data_processing` (l'athlète écrit sa propre donnée — mêmes règles que `confirm`).

### 3. Sémantique d'écriture — déclaration/correction (remplace)

Un record manuel **écrase** la marque courante de l'épreuve (`upsert`, `performance_id = null`),
**sans** garde « doit améliorer » : c'est une **déclaration** (initialisation de PB) ou une
**correction**. Conséquence assumée : un set manuel peut remplacer une marque auto-détectée — c'est le
choix explicite de l'athlète (le badge passe « manuel »). La détection auto reprend la main au prochain
record **strictement meilleur** (ADR-20 inchangé). Pas de gate min/max sur la valeur saisie (sinon on
ne pourrait pas corriger une marque trop optimiste vers le bas).

### 4. Modèle — inchangé

Aucune migration : `personal_records` (ADR-20) a déjà `performance_id` nullable, l'unicité
athlète × épreuve, et les colonnes unit/direction/value. L'`upsert` manuel renseigne
`label/value/unit/direction/achievedAt`, `performance_id = NULL`.

### 5. UI (A-07)

Éditeur de record manuel dans la section Progression (`PersonalRecordsSection`) : « Ajouter un record »
→ choix de la **famille** (chips) → champ paramètre contextuel (distance / poids d'engin / hauteur·perche /
rien) → **valeur** + **date** → `POST`. Invalide le cache records (`['records','me']`) + (côté athlète)
réutilisable. Côté coach, **lecture seule** (déjà livrée TLX-112) — pas d'édition par le coach.

**Conséquences.**

- **Positives :** l'onboarding d'un athlète chevronné devient possible (initialiser ses PB) ; les marques
  erronées sont corrigeables ; **zéro migration** ; clé d'épreuve **unifiée** auto/manuel (une seule
  fabrique) ; le `PUT` confirm-from-perf reste intact ; additif et rétro-compatible.
- **À assumer :** un set manuel peut écraser une marque auto (choix de l'athlète, tracé par
  `performance_id = null`). La saisie structurée (famille + param) est un peu plus verbeuse qu'un champ
  texte libre, mais c'est ce qui garantit une clé/unité correctes.
- **Écartées :** (a) catalogue fermé d'épreuves — impossible (distances/poids libres) ; (b) `eventKey`
  libre en entrée (parser la clé) — fragile, fuite d'un détail interne ; (c) garde « doit améliorer » sur
  le manuel — empêcherait la correction ; (d) édition coach des records d'un athlète — hors périmètre
  (le coach lit, l'athlète possède ses marques).

**Périmètre de livraison (après acceptation).** Module `manual-event.ts` (+ refactor partage avec
`record-detection`) → contrat (`POST /athletes/me/records`, `ManualRecordRequest`) → backend
(`RecordsService.createManual`, consent `data_processing`, upsert) → tests (module pur + service +
intégration) → UI éditeur A-07 + tests.
