# ADR-18 — Schéma `exercises` v2 : blocs typés par discipline (union discriminée)

- **Statut :** Accepté
- **Date :** 2026-06-09 (validé 2026-06-09)
- **Complète :** `Talent-X_06_Modele_de_donnees.md` §9.1 (contrat `exercises`),
  `talent-x-openapi.yaml` (schémas `Exercise`, `ExercisesDoc`)
- **Tickets liés :** TLX-052 (constructeur C-05, coquille générique — livré),
  TLX-053→061 (sélecteur de type + éditeurs typés — **bloqués par cet ADR**),
  TLX-062 (cibles de bloc → pré-remplissage saisie perf A-04)
- **Réf. :** CLAUDE.md règles 5 et 7, ADR-17 (méthode : figer un contrat ouvert),
  schéma `results` v1 (§9.2), client généré orval (`packages/api-client`)

## Contexte

Le contrat `exercises` **v1** (TX-DATA-006 §9.1), implémenté tel quel par le DTO
backend [`exercises.dto.ts`](../../apps/api/src/sessions/dto/exercises.dto.ts) et
l'OpenAPI, décrit un bloc **générique et plat** :

```jsonc
items[] : { name, order, sets?, reps?, durationSeconds?, restSeconds?, load?{value,unit}, notes? }
```

Aucun discriminant `type`, aucun champ propre à une discipline.

Or le backlog C-05 (`Talent-X_structure-tickets_v2.md` §6) prescrit un **sélecteur de
type de bloc** (TLX-053) puis **8 éditeurs typés** (TLX-054→061) dont les champs
n'existent pas dans v1 :

| Ticket | Éditeur | Champs propres |
|--------|---------|----------------|
| 054 | Fractionné / Intervalles | nombre de répétitions, distance/durée d'effort, récupération |
| 055 | Sprints / répétitions de vitesse | distances, départs, récup |
| 056 | Course continue / Tempo / Côtes / Fartlek | allure cible, dénivelé |
| 057 | **Haies** | rythme, **hauteur**, **espacement** |
| 058 | **Sauts** | longueur d'**élan**, sauts complets, pliométrie |
| 059 | Lancers | engin, technique vs complets |
| 060 | Musculation | séries × reps × charge *(= v1 générique)* |
| 061 | Gainage / Circuit / Échauffement / Retour au calme | durée, tours |

Seul **Musculation (060)** entre dans v1. Les 7 autres exigent des champs absents du
contrat. Et le `ValidationPipe` global tourne en **`forbidNonWhitelisted: true`**
([`main.ts`](../../apps/api/src/main.ts)) : tout champ hors-DTO est **rejeté (400)** —
il n'y a pas de stockage silencieux possible.

Étendre le contrat des blocs **est une décision structurante** qui touche `docs/`
(règle 5) et la forme publique de l'API → règle 7 (ADR avant de coder).

## Décision (proposée)

**Faire passer `exercises` en v2 sous forme d'union discriminée additive**, où le bloc
générique v1 devient **une variante parmi d'autres** :

- Ajouter un champ **`type`** à `Exercise` (enum `BlockType`) :
  `strength | interval | sprint | endurance | hurdles | jumps | throws | core | warmup | cooldown | custom`.
- **Conserver les champs v1 comme base commune** (`name`, `order`, `sets?`, `reps?`,
  `durationSeconds?`, `restSeconds?`, `load?`, `notes?`) — valables pour tout type.
- Ajouter un objet **`params?`** optionnel portant les champs **propres au type**
  (ex. `hurdles : { height?, spacing?, rhythm? }`, `jumps : { approachMeters?, kind? }`,
  `interval : { reps?, workSeconds?|workMeters?, recoverySeconds? }`). `params` est
  validé **en fonction de `type`** (validateur discriminé côté backend, à l'image du
  `ValidateNested` existant).
- Bumper **`schemaVersion: 2`** et `exercises_schema_version` par défaut à `2` pour les
  nouvelles séances.

**Portée de cet ADR (cadre, pas détail).** Cet ADR fige uniquement le **cadre** v2 :
existence de `type` (enum `BlockType`), base commune = champs v1, présence d'un conteneur
`params` discriminé par `type`, et `schemaVersion: 2`. Au stade du cadre, `params` est un
objet **libre** (`additionalProperties`) — la **forme précise de `params` pour chaque
discipline est définie par le ticket de l'éditeur correspondant** (TLX-054…061), qui
resserre la validation backend de sa variante au moment où il est implémenté. On évite
ainsi de trancher les 8 disciplines en amont ; le contrat s'étend variante par variante.

**Défaut legacy.** Un bloc hérité v1 sans `type` est lu comme **`type: "custom"`**
(variante générique neutre, sans sémantique de discipline) — c'est aussi le type de
sortie de l'éditeur générique livré par TLX-052 tant qu'aucune discipline n'est choisie.

**Rétro-compatibilité (clé de l'ADR).** Toute séance v1 reste valide : un bloc sans
`type` est lu comme **`type: "custom"`**, `params` absent. Aucune
migration de données obligatoire ; la lecture tolère v1 et v2 (cf. §9.3 versionnement).
Conséquence directe : **l'éditeur générique livré par TLX-052 n'est pas jeté** — il
devient l'éditeur de la variante `custom`/`strength`, et les éditeurs typés ajoutent
seulement la section `params`.

**Cibles → pré-remplissage (TLX-062).** Les champs `params` typés deviennent la source
des cibles exploitables (la perf `results` v1 pourra pré-remplir reps/charge/temps depuis
le bloc), ce que le texte libre `notes` ne permettait pas.

## Conséquences

- **+** Donnée d'entraînement **typée et requêtable** par discipline → socle des
  éditeurs C-05, du pré-remplissage A-04 (TLX-062), et plus tard de la progression.
- **+** **Zéro rework** du constructeur générique (TLX-052) : il est un sous-cas de v2.
- **+** Migration **non bloquante** : v1 et v2 coexistent ; le client orval est
  régénéré, OpenAPI ↔ DTO Nest ↔ écrans alignés (méthode ADR-17).
- **−** Surface de contrat plus large : chaque type ajoute un sous-schéma `params` à
  maintenir (OpenAPI + DTO + UI). Mitigé en livrant les types par priorité (Urgent →
  intervalles/sprints, puis High, puis Medium) plutôt qu'en bloc.
- **−** Validation backend discriminée plus riche (par `type`) → tests par variante.
- **−** `results` (§9.2) reste v1 pour le MVP ; l'alignement fin cibles↔résultats par
  type est hors périmètre de cet ADR (à traiter avec TLX-062).

## Alternatives écartées

- **Rester en v1 + tout mettre dans `notes`** (types comme simples libellés UI) :
  lossy, non requêtable, **casse TLX-062**. Anti-pattern pour une app dont la donnée
  par discipline est la valeur. Rejetée.
- **Un schéma distinct par type** (pas de base commune) : duplique `name/order/load`,
  complique la liste hétérogène de blocs et le rendu côté athlète. Rejetée au profit de
  la base commune + `params`.
- **Champs typés à plat sur `Exercise`** (ex. `hurdleHeight`, `approachMeters` au même
  niveau que `sets`) : pollue le schéma de champs non pertinents pour 90 % des blocs et
  empêche une validation discriminée propre. Rejetée au profit de `params`.
- **Repousser tout C-05 jusqu'à v2** (ne rien livrer avant l'ADR) : prive le coach d'un
  constructeur fonctionnel alors que la coquille générique est déjà dans le contrat v1.
  Rejetée — d'où la livraison TLX-052 en amont.
