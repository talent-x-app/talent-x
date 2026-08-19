# Rapport de campagne — 2026-08-19 — QA-02 (partiel) + QA-05.3

Quatrième session de la journée. **Interrompue par un défaut bloquant : le coach ne peut
pas enregistrer une séance sans crasher l'app (TLX-238).** Tout ce qui ne dépend pas de
ce chemin a été déroulé.

Point positif majeur : `group_update` a enfin été reçu **sur l'appareil coach**, ce qui
clôt la partie technique de TLX-84 — les trois types de sa DoD sont désormais validés sur
appareil réel.

## Contexte

|                |                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------- |
| Appareil       | Android S20 FE — **connecté en coach** (`+qa-coach`) pour la première fois de la campagne |
| Athlète pilote | `+qa-athlete2` (créé ce jour, `7e210e70`) — script `athlete.mjs`                          |
| Coach B        | `coach.staging.1787…` (18/08) — réutilisé pour les sondes d'étanchéité                    |
| Groupe testé   | « Qa-02 » `f256330f`, créé **sur l'appareil**                                             |

## Résultats par scénario

| Scénario                                     | Verdict          | Preuve                                                                                      |
| -------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| QA-02.1 — création de groupe sur appareil    | ✅               | groupe `f256330f` créé à `14:02:18`, code affiché avec QR                                   |
| QA-02.1 — adhésion par code                  | ✅               | `+qa-athlete2` rejoint à `14:06:03.686`                                                     |
| QA-02.1 — **régénération du code**           | ✅               | ancien `Z8W6GYJJ` → **404 « Code d'invitation invalide ou révoqué. »** ; nouveau → accepté  |
| QA-02.1 — sortie de groupe                   | ✅               | `left_at` posé à `14:11:45` ; **ligne conservée**, la ré-adhésion en crée une seconde       |
| QA-02.1 — minimisation du roster (ADR-37)    | ✅               | nom + avatar, rien d'autre                                                                  |
| **QA-05.3 — `group_update` appareil coach**  | ✅ **fermé**     | `14:06:03.727` puis `14:13:25.792`, **worker muet** — premier `group_update` avec une cible |
| QA-02.8 — étanchéité entre coachs (4 sondes) | ✅               | 403 sur lecture / membres / code / suppression du groupe d'autrui                           |
| QA-02.8 — symétrie                           | ✅               | coach A refusé chez B comme B chez A                                                        |
| QA-02.8 — matrice de rôles (4 sondes)        | ✅               | coach sur route athlète → 403 ; athlète sur dashboard / séance / groupe → 403               |
| QA-02.8 — ownership entre athlètes           | ✅               | athlète sur l'affectation d'un autre → 403                                                  |
| QA-02.8 — sans jeton                         | ✅               | 401                                                                                         |
| QA-02.2 — construire une séance              | ❌ **TLX-238**   | **crash à l'enregistrement** — `groups.map is not a function`                               |
| QA-02.3 à QA-02.7                            | ⏭ **non joués** | bloqués par TLX-238 : tous partent d'une séance enregistrée                                 |

## Le défaut bloquant — TLX-238

`GROUPS_QUERY_KEY = ['groups']` a **deux producteurs qui n'y écrivent pas la même chose** :
`CoachGroupsScreen` y met un `Group[]`, `CoachAssignScreen` l'enveloppe `{ data, meta }`.
Le dernier qui écrit gagne, et casse l'autre.

Le chemin réel : le coach passe par « Groupes » (cache = tableau), construit sa séance, et
l'enregistrement le renvoie sur l'écran d'affectation — qui écrase le cache avec
l'enveloppe. `CoachGroupsScreen`, **jamais démonté** puisque c'est un onglet masqué, se
re-rend sur cet objet et crashe. **Un écran que l'utilisateur ne regardait même pas.**

L'autre sens est pire parce qu'il est muet : cache = tableau, l'écran d'affectation lit
`array.data` → `undefined` → `?? []` → **liste de groupes vide, sans erreur**. Le coach
croit n'avoir aucun groupe à qui affecter.

Ni TypeScript ni Jest ne pouvaient le voir : chaque `useQuery` déclare **son propre type**
pour la même clé — localement cohérents, mutuellement contradictoires — et les tests
montent **un écran à la fois** avec un client neuf. La collision n'existe que dans l'app.

C'est la troisième manifestation du même piège structurel, après TLX-236 et TLX-237 : **les
écrans `Tabs.Screen … href: null` ne sont jamais démontés.**

## Une correction de la campagne elle-même

**Ma fiche QA-02.8 exigeait un 404 que rien ne prescrit.** J'y avais écrit « sondes → 404
anti-énumération (groupe étranger) », présenté comme conforme à la matrice de droits.
L'API répond **403 « Ce groupe ne vous appartient pas. »**.

Vérification avant de crier au défaut : le contrat déclare **403 _et_ 404** pour
`GET /groups/{id}`, et la spec fonctionnelle n'impose l'anti-énumération que sur la
**réinitialisation de mot de passe**. Le seul code de refus prescrit est
`CONSENT_REQUIRED (403)`.

**L'API est conforme ; c'est mon attendu qui ne l'était pas.** Sept sondes sur treize
étaient rouges pour cette seule raison, alors qu'aucune n'avait révélé de trou : les
treize ont été refusées. Fiche corrigée — ce qui se teste est qu'aucune sonde ne passe,
pas le code exact.

C'est précisément le piège que le §2 du plan vise : un attendu écrit de mémoire devient une
fausse anomalie, et fait perdre une journée à quelqu'un sur un correctif inutile.

Reste une remarque de conception, **non ticketée** : un 403 confirme l'existence d'un
groupe dont on détient déjà l'UUID. Avec des identifiants non devinables, l'énumération
est impraticable et le contrat tranche en faveur des deux. À arbitrer un jour, pas un
défaut.

Seconde correction, mineure : la fiche QA-05.3 annonçait que le tap d'un `group_update`
ouvre « l'écran du groupe ». `notificationHref` route délibérément vers la **liste des
athlètes** — il n'existe pas d'écran groupe dédié côté coach. Fiche alignée sur le code.

## Vérifié vs supposé

**Mesuré** — les horodatages d'adhésion, de sortie et de notification en base ; le silence
du worker sur les deux `group_update` ; les treize codes HTTP des sondes ; le refus de
l'ancien code d'invitation ; la forme réelle de `GET /groups` sur le staging.

**Supposé / déduit** — le délai d'environ **5 minutes** avant l'apparition d'un membre dans
la liste : attribué au `gcTime` par défaut de TanStack Query (5 min), ce qui en ferait un
effet de bord du ramasse-miettes plutôt qu'un rafraîchissement. Cohérent avec l'ordre de
grandeur observé, **non instrumenté**.

## Un problème de méthode rencontré en séance

Pendant la campagne, la session de correction du lot 2 travaillait **dans le même
répertoire de travail** que celui servi par Metro à l'appareil. On qualifiait donc un
artefact susceptible de changer sous nos pieds — ce que le §8 du plan interdit
explicitement. Aucune mesure de ce rapport n'en a été affectée (les fichiers fautifs de
TLX-238 n'étaient pas modifiés, vérifié), mais la campagne a dû suspendre ses commits pour
ne pas polluer une branche de correctif.

**À retenir pour les prochains lots : une session de correction concurrente doit travailler
dans un `git worktree` séparé.**

## Écarts du registre touchés

| Ligne du registre                    | État                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------- |
| TLX-84 — `group_update` sur appareil | **Résolu** — partie technique close, reste la documentation du transfert UE |
| TLX-238 (nouveau)                    | **Ouvert — bloquant**                                                       |

## Suites à donner

- [ ] **TLX-238 en priorité absolue** : QA-02.2 à QA-02.7 sont tous bloqués derrière lui.
- [ ] Rejouer QA-05.2, QA-05.4 et QA-05.6 après le déploiement du lot 2 (TLX-236, TLX-235,
      TLX-237 fusionnés dans `main`) — c'est le rejeu qui les clôt, pas le commit.
- [ ] QA-02.8 : le renommage de groupe et le retrait de membre restent à jouer **sur
      appareil** (seules les sondes HTTP ont été déroulées).
