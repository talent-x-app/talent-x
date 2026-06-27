# ADR-53 — Onglet « Séances » coach (Liste ⇄ Calendrier) en remplacement de l'onglet Calendrier

- **Statut :** Accepté (2026-06-27, validé)
- **Date :** 2026-06-27
- **Amende / complète :** **ADR-44** (asymétrie de navigation : athlète « séance-centré » avec onglet
  Séances Liste⇄Calendrier, coach « groupe-centré »), **ADR-47** (calendrier Mois⇄Semaine),
  ADR-29 (modèles = `Session` statut `template`, bibliothèque C-10). Réutilise ADR-35/30 (date
  d'occurrence sur l'affectation) et TLX-195 (date effective d'une séance).
- **Réf. :** proposition produit (2026-06-27) — donner au coach une **liste de ses séances** et un
  hub unique « Séances ». CLAUDE.md règle 7 (changement de navigation structurant → ADR avant code).
- **Tickets liés :** nouveaux TLX-203 (hub + nav), TLX-204 (liste 4 filtres), TLX-205 (enrichissement, lot 2).

## Contexte

Trois constats convergents :

1. **Le coach n'a aucune liste de ses séances.** `GET /sessions` (role-aware) renvoie pourtant
   toutes ses séances ; il n'est consommé que par le **calendrier** et la **bibliothèque de
   modèles**. Une séance **créée puis non assignée** est donc **introuvable** (trou relevé sur
   TLX-198 : « Assigner plus tard » dépose sur le détail, mais rien ne permet de retrouver la
   séance ensuite si elle n'est pas datée).
2. **Les « Modèles » sont planqués sous l'onglet Athlètes** (`CoachAthletesScreen`) — placement
   incohérent.
3. **Asymétrie avec l'athlète** : l'athlète a déjà un onglet **Séances** à bascule **Liste ⇄
   Calendrier** (ADR-44/47). Le coach, lui, n'a qu'un onglet **Calendrier** isolé.

## Décision

### D1 — Barre de navigation coach : « Calendrier » → « Séances »

Onglets coach : **Accueil · Athlètes · Séances · Profil** (toujours 4, pas de 5ᵉ onglet). L'onglet
**Calendrier autonome disparaît** ; le calendrier devient un **sous-onglet** de Séances.

### D2 — Écran « Séances » = hub à bascule **Liste ⇄ Calendrier**

`SegmentedTabs` (même patron que l'athlète, `AthleteSessionsScreen`). L'onglet **Calendrier**
réutilise `CoachCalendarScreen` en **mode embarqué** (`embedded`, comme `AthleteCalendarScreen`).
Atterrissage par défaut : **Liste → À venir**.

### D3 — Liste = 4 filtres dérivés de `GET /sessions` (+ `GET /assignments` pour les dates)

La **date effective** d'une séance = `scheduledDate` sinon l'**échéance de son affectation**
(réutilise `coachSessionEntries`/`earliestDueDateBySession`, TLX-195). Pivot = aujourd'hui.

- **À venir** — séances **publiées** de date effective ≥ aujourd'hui, tri **croissant** (le plus
  proche d'abord) ; **+ les publiées sans date** (ni planifiée ni assignée) **en tête**, marquées
  **« Non planifiée »** (elles demandent une action : planifier/assigner).
- **Passées** — date effective < aujourd'hui, tri **décroissant** (récent d'abord) ; les **en
  retard** (non réalisées) ressortent.
- **Brouillons** — statut `draft`.
- **Modèles** — statut `template` : **rapatrie** la bibliothèque (`CoachTemplatesScreen`) dans le
  hub ; retrait de l'entrée « Modèles » de l'onglet Athlètes.

### D4 — Création depuis le hub

Bouton **« Nouvelle séance »** dans l'en-tête du hub Séances (le raccourci du dashboard est
conservé). L'entrée « Modèles » est retirée de l'onglet Athlètes (déplacée dans le hub).

### D5 — Découpage en lots

- **Lot 1 (ce périmètre)** : nav (D1) + hub Liste⇄Calendrier (D2) + liste à 4 filtres (D3) +
  création (D4). Lignes de liste **simples** (titre · date effective ou « Non planifiée » · statut).
- **Lot 2 (différé)** : lignes **enrichies** (pastille discipline, « assigné à N » via TLX-193,
  badge **En retard**), **recherche** + **filtre discipline** (réutilise `SearchField`), **compteurs**
  par onglet.

### D6 — Invariants

**Zéro backend** : `GET /sessions` (role-aware coach) et `GET /assignments` (échéances) déjà
disponibles. Aucune migration, aucun contrat touché. Réutilise les dérivations TLX-195.

## Conséquences

- **+** Le coach **retrouve enfin ses séances** (comble le trou TLX-198) ; création + consultation
  au même endroit.
- **+** Cohérence athlète ⇄ coach (même patron Séances Liste⇄Calendrier).
- **+** Onglet **Athlètes allégé** (Modèles rapatriés).
- **−** **Amende ADR-44** : l'asymétrie de navigation se réduit (le coach gagne un onglet Séances).
  Assumé — l'asymétrie d'ADR-44 portait sur le *hub de groupe*, pas sur l'accès aux séances.
- **−** Le calendrier perd son **onglet dédié** (désormais sous Séances) — un tap de plus pour y
  accéder.
- **−** Nouveau hub + écran liste + tests ; câblage de `CoachCalendarScreen` en mode embarqué.

## Alternatives écartées

- **Garder Calendrier en onglet + ajouter un 5ᵉ onglet Séances.** Rejeté : 5 onglets surchargent la
  tab bar (la maquette tient à 4–5 max, cohérence athlète à 5).
- **Liste des séances sous le dashboard.** Rejeté : le dashboard est le pilotage (KPIs/à revoir),
  pas un répertoire ; la liste mérite son entrée de 1er niveau.
- **Garder « Modèles » sous Athlètes.** Rejeté : incohérent ; le hub Séances est leur place.
- **Tout livrer d'un coup (lignes riches + recherche).** Reporté en lot 2 pour livrer la structure
  vite et itérer.

## Plan (tickets — additifs, testés, zéro backend)

1. **TLX-203 (nav + hub)** — remplacer l'onglet Calendrier par Séances ; hub `SegmentedTabs`
   Liste⇄Calendrier ; `CoachCalendarScreen` en mode embarqué ; bouton « Nouvelle séance » ; retrait
   de l'entrée Modèles d'Athlètes. Tests nav + rendu.
2. **TLX-204 (liste 4 filtres)** — À venir (+ Non planifiée) · Passées · Brouillons · Modèles, dates
   effectives + tris ; états vide/chargement/erreur ; tests des buckets + tri.
3. **TLX-205 (lot 2)** — lignes enrichies (discipline/assignés/retard), recherche + filtre,
   compteurs par onglet.
