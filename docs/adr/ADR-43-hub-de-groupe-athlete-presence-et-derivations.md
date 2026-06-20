## ADR-43 — Hub de groupe athlète : présence (RSVP) orthogonale au cycle d'exécution + discipline & perf attendue dérivées des blocs typés

- **Statut :** Accepté (2026-06-20 proposé · 2026-06-20 accepté — à valider avant code, CLAUDE.md §7)
- **Date :** 2026-06-20
- **Décisions actées :** (1) la **présence déclarée** (RSVP, en amont) est un concept **distinct** du cycle d'exécution ADR-31 (en aval) — champ additif `attendance` sur l'affectation, **pas** un re-mapping de `status` ; (2) la **discipline** d'une séance n'est **pas** un champ stocké — **dérivée** des blocs typés (miroir ADR-20/32) ; (3) la **perf attendue** n'est **pas** un flag — **dérivée** de la présence de blocs mesurables ; (4) le **fil/calendrier** athlète se lit sur `GET /assignments` **existant** (regroupement client) — filtres serveur par plage de dates / discipline **différés** (Lot 2) ; (5) la **visibilité pair-à-pair de la présence** (pile d'avatars nominative) est **hors MVP** — seul un **compteur agrégé** est exposé tant que l'AIPD n'a pas tranché.
- **Réf. :** maquettes `mockups/group-feed-v1.html`, `mockups/group-calendar.html`, `mockups/group-hub.html`, `mockups/group-past-sessions.html` · ADR-26 (lecture athlète des groupes, `GET /groups/mine`) · ADR-30 (assignation séance→groupe, fan-out à la maille athlète, `group_assignment_id`) · ADR-31 (cycle de vie des affectations : `assigned/in_progress/skipped(+skipReason)/completed`) · ADR-20 (records, `eventForExercise`) · ADR-32 (records manuels, `manual-event.ts`) · ADR-28 (brief double lecture) · ADR-37 (visibilité pair-à-pair, gabarit AIPD) · ADR-08 (RBAC + appartenance + ownership + consentement) · `talent-x-openapi.yaml` (`Assignment`, `AssignmentStatus`, `Session`, `/assignments`, `/assignments/{id}`, `/assignments/{id}/performance`) · TX-SPEC-002 §5/§6 · TX-DATA-006 §5

**Contexte.** L'écran de détail d'un groupe côté athlète est aujourd'hui purement administratif
(`AthleteGroupDetailScreen` : méta `GET /groups/mine` ADR-26 + roster `GET /groups/{id}/teammates`
ADR-37 + « Quitter »). Les maquettes validées le transforment en **hub d'affichage** : un onglet
« Séances » (carte « à faire », fil groupé À venir / Passées), un onglet « Calendrier » (Mois/Semaine,
recherche, filtres discipline), le **détail d'une séance**, la **présence** confirmable en un geste, la
**saisie de perf** quand la séance l'exige, et le **feedback coach** sur les séances passées.

Trois besoins de la maquette **ne sont pas couverts par le contrat** et touchent des invariants déjà
actés (ADR-30/31/20/32) — donc ADR avant code (CLAUDE.md §7) :

1. **Présence « Présent / Absent / Peut-être ».** ADR-31 a fixé une machine à états d'**exécution** —
   `assigned → in_progress → completed` (perf soumise), `skipped(+skipReason)` réversible — et s'en
   sert pour l'**assiduité** (`skipped` sort du dénominateur). Or « confirmer sa présence » est une
   **intention déclarée en amont** (logistique : le coach prépare sa séance), pas un fait d'exécution.
   Mapper « Absent » sur `skipped` est tentant, mais : (a) « Présent » et « Peut-être » **n'ont aucun
   équivalent** (`assigned` est le défaut passif, pas une confirmation ; `in_progress` = « j'ai
   commencé ») ; (b) confondre les deux **pollue l'assiduité** (répondre « peut-être » trois jours
   avant ne doit pas compter comme une séance manquée) et **perd la distinction sans-réponse ≠ absent**
   qui est tout l'intérêt produit côté coach (« qui relancer »).

2. **Discipline de la séance** (la maquette colore les pastilles et filtre par Sprint / Endurance /
   Muscu / Sauts / Haies). Le schéma `Session` **n'a pas** de champ discipline (`title`, `description`,
   `scheduledDate`, `status`, `exercises`, `brief`).

3. **« Perf requise »** (badge + CTA conditionnel) et **« record perso / PR »**. Le PR existe déjà
   (`personal_records`, ADR-20/32) ; mais aucun **flag** ne dit qu'une séance « attend » une perf.

**Contrainte structurante à préserver.** (i) La maille d'exécution reste `SessionAssignment` par
athlète (ADR-30) ; `completed` est terminal et adossé 1:1 à une `Performance` (ADR-31) — aucune
nouveauté de cet ADR ne doit toucher une affectation `completed` ni le calcul d'assiduité. (ii)
L'espace des épreuves est **paramétrique et dérivé des blocs typés** via `eventForExercise` (ADR-20) /
`eventForManual` (ADR-32) : il existe **déjà une source de vérité** « bloc → famille/épreuve ». Tout
nouveau besoin « discipline » ou « perf attendue » **doit s'y adosser** plutôt qu'introduire une
seconde vérité concurrente.

**Décision.**

### 1. La présence (RSVP) est orthogonale au cycle d'exécution ADR-31

On **n'étend pas** `AssignmentStatus`. On introduit un champ **additif et indépendant** sur
l'affectation, décrivant l'**intention de présence** déclarée *avant* la séance :

```
attendance ∈ { going, not_going, maybe } | null        // null = sans réponse (défaut)
attendanceReason? : 'injury' | 'absence' | 'weather' | 'other'   // réutilise SkipReason, requis ssi not_going
```

- C'est un **axe distinct** de `status` (ADR-31). Une affectation peut être `attendance=going` **et**
  `status=assigned` ; `attendance=not_going` **et** `status=assigned` (l'athlète ne viendra pas mais
  l'exécution réelle se tranchera en aval). Les deux ne se contredisent jamais car ils décrivent deux
  moments (intention vs exécution).
- **Contrat (additif).** `Assignment` gagne `attendance` (+ `attendanceReason`). Écriture par un verbe
  dédié et minimal :
  ```
  PUT /assignments/{id}/attendance
  AttendanceRequest = { attendance: 'going'|'not_going'|'maybe', reason?: SkipReason }
    invariant : reason requis ssi attendance='not_going' (sinon ignoré) → 422 sinon
  → 200 Assignment (RBAC : athlète titulaire ; membre actif du groupe)
  ```
  Choisi **contre** un champ ajouté à `PATCH /assignments/{id}` (qui mélangerait deux responsabilités
  — exécution vs intention — sur un même verbe et brouillerait les autorisations).
- **Articulation, sans couplage dur.** `not_going` **n'écrit pas** `skipped` automatiquement
  (l'exécution reste tranchée par ADR-31 le jour J). En revanche, le front **peut proposer** à
  l'athlète, au moment où il déclare `not_going` avec motif, de poser aussi `skipped` (ADR-31) pour
  sortir la séance de ses retards — geste explicite, jamais implicite. `attendance` **n'entre pas**
  dans le calcul d'assiduité (qui reste fondé sur `status`, ADR-31 §2).
- **Échéance de réponse** (`attendanceDeadline`, maquette) : **dérivée**, pas stockée — `dueDate`
  (ADR-31) moins un délai de configuration (`.env`), affichée tant que `attendance = null`.

### 2. Discipline de séance → dérivée des blocs typés (zéro champ, zéro migration)

Module **pur** `progress/session-discipline.ts` : `sessionDiscipline(exercises) → family | 'mixed' |
'none'`, **réutilisant** la fabrique épreuve→famille d'`eventForExercise` (ADR-20). La discipline est la
**famille dominante** des blocs typés de la séance (`sprint | hurdles | endurance | interval | jumps |
vertical | throws | strength`), `mixed` si plusieurs familles à parts comparables, `none` si non typé.
Elle alimente les **pastilles colorées**, les **tags** et le **filtre discipline** du calendrier.
Avantage : **une seule source de vérité** discipline (cohérente avec les records), pas de double saisie
ni de désynchronisation, pas de migration. Le mapping famille → libellé/couleur vit côté design tokens.

### 3. « Perf attendue » → dérivée de la présence de blocs mesurables (zéro flag)

Même module : une séance **attend une perf** ssi elle porte ≥1 **bloc mesurable** (chrono / distance /
charge — famille à record, ADR-20). Le badge « ⏱ Perf à saisir » et le CTA « Saisir ma perf »
(`POST /assignments/{id}/performance`, inchangé, consent-gated) s'affichent **quand l'affectation est
exécutable** (`status ≠ completed`) **et** la séance mesurable. Le badge **🏅 PR** continue de venir des
records existants (ADR-20/32). Aucun flag, aucune nouvelle colonne.

### 4. Fil & calendrier → lecture sur l'existant, filtres serveur différés

Le fil et le calendrier athlète se lisent sur **`GET /assignments` existant** : chaque `Assignment`
porte `dueDate` + `session` (+, après cet ADR, `attendance`). Le **regroupement** À venir / Passées /
par jour, le **filtre discipline** (dérivé §2) et la **recherche par titre** sont faits **côté client**
sur le jeu paginé — suffisant pour le volume d'un athlète et **sans changement de contrat** (Lot 1).

**Lot 2 (différé, perf à l'échelle)** — quand le volume l'exige : paramètres **additifs**
`from` / `to` (plage de dates) et `discipline` sur `GET /assignments`, la discipline étant **résolue
côté serveur** par la même dérivation §2 (jamais un champ client). Strictement additif, rétro-compatible.

### 5. RGPD — présence agrégée d'abord, identités sous AIPD

La maquette affiche une **pile d'avatars nominative** (« 9 présents : AM, KT, LB… »). C'est une
**nouvelle visibilité pair-à-pair de la présence** (donnée de comportement), au-delà de l'identité déjà
exposée par ADR-37. Par minimisation : en **MVP, seul le compteur agrégé** est exposé à l'athlète
(« 9 présents · 1 absent · 2 sans réponse »), **sans** rattacher les noms. L'exposition **nominative**
de la présence est **hors périmètre** tant que la **revue AIPD / notice de confidentialité** (gabarit
ADR-37, TX-DPIA-007) ne l'a pas explicitement validée. La présence reste évidemment visible **du coach**
(scope légitime de pilotage, déjà acquis).

**Conséquences.**

- **Positives :** présence fidèle à la maquette (3 états + sans-réponse) **sans casser** l'assiduité
  ADR-31 ; discipline et perf attendue **gratuites** (dérivées, zéro migration, une seule vérité avec
  les records) ; fil/calendrier livrables **immédiatement** sur le contrat actuel (Lot 1) ; surface de
  contrat minimale (un champ + un verbe) ; RGPD préservé par défaut (agrégat).
- **Négatives / coûts :** un nouvel axe `attendance` à maintenir (migration additive + un endpoint +
  régénération `@talent-x/api-client`) ; la dérivation discipline/perf a un **coût de calcul** à la
  lecture (mitigé : pur, mémoïsable, déjà payé par la détection de records) ; filtres serveur reportés
  — si un athlète accumule beaucoup d'affectations, la pagination client devra passer en Lot 2 ; la
  présence nominative entre coéquipiers est repoussée (dépendance AIPD).

**Alternatives considérées.**

- **Tout mapper sur ADR-31** (`not_going = skipped`, pas de « Présent »/« Peut-être »). Écarté :
  perd deux états produits, pollue l'assiduité, efface la distinction *sans-réponse ≠ absent* (cœur du
  besoin coach).
- **Présence booléenne** (présent/absent). Écarté : perd « peut-être » et « sans réponse », trop
  pauvre pour la logistique d'un club.
- **Champ `discipline` stocké sur `Session`** (saisi par le coach). Écarté : double vérité avec les
  records, saisie redondante, risque de désynchronisation, migration ; la dérivation est gratuite et
  canonique.
- **Flag `requiresPerformance` sur `Session`**. Écarté : même dérivation possible depuis les blocs
  typés ; un flag manuel pourrait contredire le contenu réel de la séance.
- **Filtres serveur (date/discipline) dès le Lot 1.** Écarté du MVP : le client suffit au volume d'un
  athlète ; introduire les paramètres maintenant anticiperait un besoin de perf non prouvé.
- **Pile d'avatars nominative en MVP.** Écarté : nouvelle donnée comportementale pair-à-pair non
  couverte par l'AIPD existante — agrégat d'abord (minimisation, cohérent ADR-37).
