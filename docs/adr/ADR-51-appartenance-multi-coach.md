## ADR-51 — Appartenance multi-coach : cloisonnement de la visibilité et du consentement

- **Statut :** Proposé (à valider avant tout code — CLAUDE.md §7)
- **Date :** 2026-06-24
- **Réf. :** ADR-05 (RGPD transverse) · ADR-08 (RBAC + appartenance + ownership + consentement) ·
  ADR-26 (`AthleteGroup`) · ADR-37 (identité minimisée pair-à-pair) · ADR-30 (fan-out de groupe) ·
  TX-SEC-003 §consentement · TX-DPIA-007 · `talent-x-openapi.yaml`

**Contexte.** On veut permettre à un athlète d'appartenir à des groupes de **coachs différents**
(suivre plusieurs entraîneurs). Le **modèle de données le permet déjà** : `GroupMember` et
`CoachAthleteLink` sont des relations *many-to-many*, `ensureGroupLink` crée un lien **par coach**,
`endLinkIfLastGroup` le clôt quand l'athlète quitte le dernier groupe de ce coach. Le blocage actuel
est seulement un **trou d'UX côté athlète** (aucun point d'entrée « rejoindre un autre groupe » dès
qu'on en a un).

**Mais activer le multi-coach naïvement ouvre deux failles de confidentialité** (sans objet en
mono-coach, structurantes en multi-coach) :

1. **Consentement global.** `coach_access` est stocké par `(user_id, type)` **sans dimension coach**
   (`ConsentGate`). Un seul `coach_access = true` autoriserait donc **tous** les coachs liés —
   l'athlète ne peut pas consentir à un coach sans consentir à tous.
2. **Lecture coach non cloisonnée.** Les lectures coach (`getForCoach`, stats, records, insights,
   perfs, commentaires) filtrent sur `{ athleteId }` **sans filtrer par coach**. Un coach B verrait
   donc **tout** l'historique de l'athlète, **y compris les performances issues des séances d'un
   coach A** → fuite inter-coach (perf/charge/record = données sensibles, ADR-08/21).

**Décision (proposée).**

**D1 — Cardinalité.** Un athlète peut appartenir à des groupes de **plusieurs coachs distincts**.
**Aucun changement de schéma** (relations déjà M:N ; `CoachAthleteLink` porte déjà un lien par coach).

**D2 — Consentement par coach.** `coach_access` devient **scopé au coach** : le consentement est
porté par le **lien coach↔athlète** (un athlète consent à *ce* coach, pas « aux coachs »). Deux
options de mise en œuvre à trancher :
- **(D2a, recommandé)** ajouter une dimension coach au consentement — soit une colonne `coach_id`
  nullable sur `consents` (NULL = consentement global historique, rétrocompat), soit un champ
  `granted_coach_access_at`/`revoked_at` sur `CoachAthleteLink`. Le **geste d'adhésion** (join via
  code) vaut consentement à ce coach ; la révocation = quitter ses groupes ou retirer l'accès.
- **(D2b)** garder `coach_access` global mais **documenter** qu'il couvre tous les coachs (rejeté :
  contraire à la minimisation et à l'attente de l'athlète).
→ `ConsentGate.assertActiveConsent` gagne un paramètre `coachId` optionnel ; les portes coach le
passent. Migration **additive** + rétrocompatible.

**D3 — Cloisonnement de la lecture coach.** Toute lecture coach des données d'un athlète est
**bornée aux séances/affectations dont le coach est l'auteur** (`session.coachId === coachId`) et aux
groupes du coach. Concrètement : `athlete-progress`, `records`, `coach-insights`, lecture des perfs
et commentaires côté coach filtrent par `coachId`. Un coach **ne voit ni** les perfs/séances d'un
autre coach, **ni** l'existence d'autres coachs/groupes de l'athlète. (L'athlète, lui, garde sa vue
unifiée — c'est *sa* donnée.)

**D4 — Surface athlète.** « Mes groupes » regroupe par coach ; chaque hub de groupe montre **son**
coach (carte « Ton coach » déjà par groupe). La vue de progression **de l'athlète** reste unifiée
(tout son historique) ; seules les vues **coach** sont cloisonnées (D3).

**D5 — Cycle de vie du lien.** Inchangé : un lien par coach, clôturé quand l'athlète quitte le
dernier groupe de ce coach (`endLinkIfLastGroup`), ce qui retire de fait l'accès et le consentement
scopé (D2).

**D6 — RGPD / DPIA.** Documenter en TX-DPIA-007 le traitement multi-coach : responsables distincts
par coach, consentement par coach (D2), cloisonnement (D3). Aucune identité de coach n'est exposée à
un autre coach.

**Conséquences.**
- **Positives :** débloque le multi-coach **proprement** (privacy by design, ADR-05) ; l'athlète
  contrôle l'accès **coach par coach** ; pas de régression mono-coach (un seul coach = comportement
  actuel) ; aucun changement de schéma sur les appartenances.
- **Négatives / coûts (réels) :** **audit + rescoping de toutes les lectures coach** par `coachId`
  (progress, records, insights, perfs, comments) — c'est le gros du travail et le risque de
  régression ; migration additive du consentement (D2a) + propagation du `coachId` dans `ConsentGate`
  et ses appelants ; tests à étendre (cas deux coachs, non-fuite croisée). **Ce coût (cloisonnement),
  pas la cardinalité, est la vraie raison de passer par un ADR.**

**Alternatives considérées.**
- **Dossier athlète partagé entre coachs** (tout coach lié voit tout l'historique). Rejeté :
  fuite de perf/charge entre coachs, contraire à ADR-08/21 et à la minimisation.
- **Statu quo « plusieurs groupes, même coach »** (option écartée par le PO mais repli possible) :
  zéro risque de fuite, simple correctif front (« rejoindre un autre groupe »), **aucun** des coûts
  D2/D3. Reste le repli si le coût du cloisonnement est jugé disproportionné au regard du besoin.
- **Garder le consentement global.** Rejeté (D2b).

**Implémentation (si accepté), par lots indépendants :**
1. Front quick win : exposer « Rejoindre un autre groupe » même avec un groupe (sans rien d'autre,
   **ne pas livrer avant D3** sinon on ouvre la fuite).
2. Backend : rescoping des lectures coach par `coachId` (D3) + tests de non-fuite croisée.
3. Backend : consentement par coach (D2a) — migration additive + `ConsentGate(coachId)`.
4. Front multi-coach : « Mes groupes » groupé par coach, sélecteur.
