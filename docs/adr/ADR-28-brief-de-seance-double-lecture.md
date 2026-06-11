# ADR-28 — Brief de séance : double lecture coach / athlète (intention, difficulté, sécurité)

- **Statut :** Proposé
- **Date :** 2026-06-11
- **Complète :** ADR-10 (contrat JSONB versionné), ADR-18/ADR-27 (contrat `exercises` —
  **non modifiés** par cet ADR), `Talent-X_06_Modele_de_donnees.md` §5.4 (table `sessions`)
  et §9, `talent-x-openapi.yaml` (schémas `Session`/`SessionCreate`/`SessionUpdate`)
- **Tickets liés :** TLX-052 (constructeur C-05 — livré), TLX-065 (détail séance A-03 —
  livré), TLX-062 (cibles de bloc — livré), TLX-086 (revue C-08 — livré), TLX-064
  (bibliothèque de modèles C-10 — à venir)
- **Réf. :** CLAUDE.md règles 5 et 7 ; cadrage produit du 2026-06-11 (« rôle coach
  expert » — double rendu Mode Coach / Mode Athlète) ; UI kit
  `design/ui_kits/talent-x-app/screens2.jsx` (`WorkoutScreen`) ; ADR-26 (précédent de
  sérialisation par rôle)

## Contexte

### Le problème

Le cadrage produit du 2026-06-11 définit ce qu'est une séance « bien écrite » : **une
seule séance, deux lectures**. Côté coach, la logique d'entraînement (intention du jour,
charge, critère de réussite, régression/progression, vigilance) ; côté athlète, une
version épurée et actionnable (objectif en une phrase, durée, difficulté, consignes
directes, « Réussi si… » / « Stop si… »). Il impose aussi deux invariants : échauffement
et retour au calme toujours présents ; jamais un exercice « nu » (intensité **et**
récupération toujours précisées).

Le **moteur de blocs typés** couvre déjà la moitié « machine » de ce cadrage :

| Rubrique du cadrage | Support actuel |
|---|---|
| Échauffement / retour au calme | ✅ `BlockType.warmup` / `cooldown` (TLX-061) |
| Séries × reps, distance/temps par bloc | ✅ base v1 + `params` typés (ADR-18, TLX-054→061) |
| Récupération | ✅ `restSeconds` / `recoverySeconds` / r·R (ADR-27 proposé) |
| Séries de courses, supersets, circuits | 🟡 ADR-27 (v3 `group`, proposé) |
| Intensité % RM, allure | ✅ `load.unit: percent_1rm`, `paceSecondsPerKm` |
| Intensité % VMA, tempo | 🟡 possible via `params` (cadre ADR-18), éditeurs à compléter |
| Consigne technique courte | ✅ `notes` de bloc |
| Cible lisible côté athlète | ✅ `formatExerciseTarget` (TLX-062) |

En revanche, la **couche éditoriale de la séance** n'existe pas dans le contrat.
`Session` = `title, description?, scheduledDate?, status, exercises` — rien ne porte
l'intention du jour, la durée totale, la difficulté, les critères de réussite/d'arrêt ni
les notes d'ajustement du coach. Deux symptômes concrets :

1. **L'UI kit maquette déjà ces champs** : l'en-tête de `WorkoutScreen` affiche
   « Durée ~50 min · 6 exercices · RPE cible 8 » — aujourd'hui non câblable, ces données
   n'existant nulle part.
2. **Aucune notion de lecture par rôle** : l'athlète reçoit la séance *entière*
   (embarquée dans `GET /assignments/:id`). Si le coach écrivait ses notes internes
   (« régression si décrochage », « vigilance dos ») dans `description` ou `notes`,
   l'athlète les recevrait telles quelles.

### Contraintes

- **Extension additive uniquement** (ADR-12 expand-contract) ; `ValidationPipe` en
  `forbidNonWhitelisted` → toute forme doit être décrite par les DTO.
- **Minimisation** : l'athlète ne reçoit que ce qui lui est destiné (philosophie
  ADR-26 — `AthleteGroup` sans `inviteCode`). Le filtrage par rôle se fait **au
  serveur**, pas dans l'UI.
- **Création rapide préservée** : un coach pressé pose deux blocs et publie. La couche
  éditoriale ne doit rien rendre obligatoire.
- Le moteur typé (`exercises` v2/v3, `results` v2, records, progression) n'est **pas
  modifié**.

## Décision (proposée)

**1. Un document JSONB versionné `brief` sur `sessions`** (méthode ADR-10) — colonne
`brief jsonb NULL` (absent = séance sans brief, toutes les séances existantes restent
valides ; pas de colonne de version dédiée : `schemaVersion` est porté par le document,
le brief n'étant ni requêté ni agrégé en SQL au MVP) :

```jsonc
{
  "schemaVersion": 1,

  // — Visible coach ET athlète —
  "athleteIntent": "Des efforts courts et rapides, réguliers. Ne pars pas trop vite.", // « en une phrase »
  "durationMinutes": 75,                       // durée estimée de la séance
  "difficulty": 7,                             // 1..10 (entier)
  "successCriteria": "Tenir les 16 efforts au même rythme.",       // ✅ Réussi si…
  "stopCriteria": "Ta foulée s'écrase ou tu ne suis plus l'allure.", // ⚠️ Stop si…

  // — Coach SEULEMENT (retiré de toute sérialisation vers un lecteur athlète) —
  "intent": "Intermittent court à haute intensité pour solliciter le VO₂max. Régularité > sprint.",
  "coachNotes": {
    "regression": "2 × 6 rép. si décrochage ; récup 1 min.",
    "progression": "Semaine suivante 2 × 10 rép. ou 40/20.",
    "caution": "Foulée qui s'écrase = arrêt. Hydratation entre séries."
  }
}
```

Règles du modèle :

1. **Tout est optionnel** — `brief` absent, partiel ou complet : aucune contrainte à la
   création ni à la publication. Rétro-compatibilité totale, zéro migration de données.
2. **Pas de champ « objectif »** : l'objectif principal (1 ligne) est porté par la
   `description` existante — déjà affichée aux deux rôles, déjà dans tous les écrans.
   On ne crée pas de doublon sémantique.
3. **La double lecture est un contrat, pas un détail d'UI** : le mapper unique
   (`session.mapper.ts`, `toSessionDto`) prend le **rôle du lecteur** et retire
   `intent` + `coachNotes` pour un athlète — sur *toutes* les surfaces où une séance
   est sérialisée (liste/lecture `/sessions` role-aware, séance embarquée dans les
   affectations).
4. **Défauts explicites plutôt que champs vides** : si `durationMinutes` est absent,
   le client affiche une **estimation dérivée des blocs** (durées, efforts × récup),
   marquée « estimée » ; le constructeur pré-remplit le champ avec cette valeur que le
   coach peut corriger. Aucune valeur magique stockée silencieusement.
5. **Les phases d'affichage sont dérivées, pas stockées** : la vue athlète regroupe
   🔥 Échauffement (blocs `warmup` de tête) / 🎯 Séance / 🧊 Retour au calme (blocs
   `cooldown` de queue) à partir des `type` existants. Aucun champ `phase` n'est ajouté.
6. **Intensité par bloc = `params` d'éditeurs** (cadre ADR-18, `params` libre au
   contrat) : `percentVma` (interval/sprint) et `tempo` (strength) s'ajoutent côté
   constructeur et `formatExerciseTarget` **sans aucun changement de contrat** — même
   pattern que TLX-054→061.

**2. Contrat OpenAPI** : schéma additif `SessionBrief` (toutes propriétés optionnelles)
référencé par `Session`, `SessionCreate`, `SessionUpdate` ; `intent` et `coachNotes`
documentés « absents pour un lecteur athlète ». Un seul schéma (pas de variante
`AthleteSessionBrief`) : tous les champs étant optionnels, l'omission par rôle reste
conforme — le précédent ADR-26 (schéma dédié) se justifiait par un champ sensible
(`inviteCode`) sur une ressource entière, ici il s'agit d'un sous-document déjà dédié.

**3. RGPD** : le brief est du **contenu rédactionnel du coach** (donnée de
planification, pas de santé — même classification qu'ADR-24) ; aucune porte de
consentement. Il suit la séance dans l'export du coach (ADR-14) et sa suppression
logique.

### Impacts (et non-impacts) en aval

| Surface | Impact |
|---|---|
| DB | Colonne `brief jsonb NULL` sur `sessions`, expand-only (ADR-12). TX-DATA-006 §5.4 et §9 à compléter (nouveau §9.x « Contrat brief »). |
| API | DTO `SessionBriefDto` (validation bornée : `difficulty` 1..10, chaînes limitées) ; mapper par rôle (règle 3). |
| Constructeur C-05 | Section repliable « Intention & lecture athlète » dans l'en-tête (intention coach, en-une-phrase, réussi si / stop si, difficulté, durée pré-estimée) + bouton **« Voir comme l'athlète »** (aperçu du rendu athlète depuis l'état du builder). |
| Détail athlète A-03/A-04 | En-tête métriques **conforme au kit UI** (Durée · Exercices · Difficulté) branché sur `brief` ; « 💡 En une phrase » sous le titre ; sections 🔥/🎯/🧊 dérivées ; carte « ✅ Réussi si / ⚠️ Stop si » au-dessus de la soumission. |
| Revue C-08 / détail C-03 | Lecture coach complète : `intent` + `coachNotes` affichés en regard de la perf (le critère de réussite devient le référentiel de la revue). |
| `results` / records / progression | **Aucun impact** (le brief ne porte aucune donnée de mesure). |
| Modèles C-10 (TLX-064) & génération assistée | Le brief fait partie du modèle dupliqué ; une future génération de séance (IA ou gabarits) produit **du JSON `exercises` + `brief`** — les deux « modes » du cadrage produit sont alors deux rendus du même document, jamais deux textes. |

## Conséquences

- **+** Le cadrage produit devient exécutable : une séance porte son intention, sa
  charge perçue et ses garde-fous, et chaque rôle reçoit **sa** lecture — sans rien
  stocker en double.
- **+** L'en-tête de séance maquetté dans le kit UI (durée, difficulté) devient câblable.
- **+** Les notes internes du coach ne transitent **jamais** chez l'athlète
  (minimisation appliquée au serveur, testable dans la matrice d'autorisation).
- **+** Zéro migration, zéro impact sur le moteur typé, composable avec ADR-27 (les
  deux étendent des plans différents : structure des blocs vs couche éditoriale).
- **−** Le mapper séance devient sensible au lecteur (signature enrichie + tests par
  rôle sur toutes les surfaces qui embarquent une séance).
- **−** Surface de saisie C-05 plus riche — à contenir par la section repliable (le
  chemin « 2 blocs et je publie » reste inchangé).
- **−** Un document JSONB de plus à versionner (coût accepté : mécanique ADR-10 déjà
  outillée trois fois — exercises, results, et désormais brief).

## Alternatives écartées

- **Stocker deux textes (Markdown « Mode Coach » + « Mode Athlète »)** : duplication
  saisie deux fois, désynchronisation au premier édit, non requêtable, inutilisable
  pour pré-remplir la saisie de perf. C'est précisément ce que la structuration doit
  éviter — le double rendu est un **rendu**, pas un stockage. Rejetée.
- **Colonnes dédiées sur `sessions`** (~7 colonnes de prose optionnelle) : élargit la
  table pour des champs jamais filtrés en SQL, alors que la mécanique documentaire
  versionnée (ADR-10) est en place et que le brief évoluera (charge planifiée, RPE
  cible par phase…). Rejetée.
- **Filtrage de la double lecture côté client** : les notes internes du coach
  transiteraient en clair dans les réponses athlète — contraire à la minimisation et à
  la confiance produit (un athlète ne doit pas découvrir « régression prévue » dans le
  payload). Rejetée.
- **Champ `phase` explicite par bloc** (échauffement/corps/retour) : redondant avec
  `type` (`warmup`/`cooldown`), divergences possibles (bloc `warmup` en phase « corps »).
  La dérivation d'affichage suffit. Rejetée.
- **Conventions dans `description`** (Markdown sectionné « ## Intention… ») : non
  validable, non filtrable par rôle, fragile au moindre édit manuel. Rejetée.

## Questions ouvertes (à trancher à la validation)

1. **Libellé produit de `difficulty`** : « Difficulté /10 » (langage du cadrage) ou
   « RPE cible » (langage du kit UI) — même champ, le libellé UI reste à choisir.
2. **Périmètre du lot 1** : inclure les params d'intensité (`percentVma`, `tempo` —
   règle 6, frontend pur) dans le premier lot d'implémentation, ou ticket séparé ?
3. **`difficulty` suggérée** : faut-il, à terme, proposer une valeur dérivée des blocs
   (volume × intensité) comme défaut explicite — ou rester 100 % manuel au MVP
   (recommandé) ?
