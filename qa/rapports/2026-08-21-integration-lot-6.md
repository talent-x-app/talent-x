# Rapport d'intégration — 2026-08-21 — lot 6

Neuvième session, courte et sans appareil : **intégration des neuf tickets du lot 6** et
vérification des signalements laissés par la session de correction.

**`main` passe de `fce9439` à `562a35f`.** Tout est vert. Trois nouveaux tickets, dont deux
issus de signalements qu'il a fallu corriger avant de les retenir.

## Intégration

Neuf branches, dix commits (TLX-259 en portait deux) : TLX-259, TLX-257, TLX-244, TLX-266,
TLX-269, TLX-267, TLX-260, TLX-268, TLX-256. Rebase sur `main` puis `--ff-only`, dans
l'ordre livré.

**Les conflits ne sont pas tombés où ils étaient annoncés.** La session de correction
prévoyait `notification-ui.ts` (TLX-266 vs TLX-268) et `SessionDetailScreen.tsx`
(TLX-269 vs TLX-268) : les deux ont fusionné seuls. Ce sont **`notification-ui.test.ts`** et
**le journal ADR** qui se sont opposés.

Le second méritait attention : la branche TLX-268 portait la version d'ADR-58 **d'avant**
l'amendement de TLX-257, chacune ayant rebasé avant l'autre. Prendre la version entrante
aurait **silencieusement annulé l'amendement** qu'on venait d'intégrer. Résolution : ligne
ADR-58 amendée conservée, et de la branche entrante seule la ligne ADR-59 reprise.

**TLX-256 a été appliquée par cherry-pick**, sa branche étant occupée par le worktree de la
session de correction. Le contenu sur `main` est identique ; la branche apparaîtra
« non fusionnée » à l'ancêtre, ce n'est pas un oubli.

## Vérification après fusion

| Contrôle               | Résultat                                               |
| ---------------------- | ------------------------------------------------------ |
| Mobile `test:cov`      | **123 suites, 1205 tests verts**, aucun seuil enfreint |
| API `test`             | **72 suites, 719 tests verts**                         |
| Typecheck mobile + API | verts                                                  |

### Une première passe rouge qui ne prouvait rien

La première exécution mobile a **échoué** : cinq suites, exit 1, seuils de couverture sous
la barre. Lecture avant de conclure — **zéro test en échec**, 1094 passés, et l'erreur était
`EPERM: operation not permitted, rename` sur le cache de transformation Jest.

Cause : les suites mobile et API avaient été lancées **en parallèle**, deux Jest se
disputant le même cache. Les cinq suites n'ont pas échoué, elles n'ont pas **démarré** — et
la couverture sous les seuils en découlait mécaniquement, leur code n'étant pas compté.

Rejouée seule, cache vidé : **123/123**. Sans cette relecture, le lot passait pour cassé et
`main` pour rouge.

### La porte de couverture a changé de métrique

| Métrique      | Après lot 6 | Seuil | Marge     | vs lot 5  |
| ------------- | ----------- | ----- | --------- | --------- |
| statements    | 88,03       | 87    | +1,03     | −0,49     |
| branches      | 80,73       | 80    | +0,73     | −0,15     |
| **functions** | **84,15**   | 84    | **+0,15** | **−0,89** |
| lines         | 89,81       | 88    | +1,81     | −0,52     |

La session de correction annonçait les **branches** comme point de bascule (80,61 sur sa
branche empilée). Après intégration complète, c'est **`functions` qui tient à +0,15** — une
seule fonction non couverte fait basculer la porte. C'est cette métrique qu'il faut
surveiller au prochain lot, pas celle qu'on surveillait.

## Les signalements, vérifiés plutôt que repris

Neuf signalements accompagnaient la livraison. Trois ont donné un ticket, et **deux d'entre
eux ont dû être corrigés avant d'être retenus**.

### TLX-274 — le jumeau de TLX-257, confirmé

`CompetitionEngageScreen` porte `confirmedNames` en `useState` sans aucune remise à zéro.
Route pourtant munie de sa `key` — et c'est le problème : la ré-entrée sur la même
compétition ne remonte rien.

Vérification faite au passage : **TLX-257 a corrigé mieux que ce que son ticket proposait.**
Le ticket suggérait une remise à zéro dans `onDone` ; la session a posé un `useFocusEffect`,
qui couvre aussi le geste de retour et le bouton matériel. Le patron à copier est celui du
code, pas celui du ticket.

### TLX-275 — bon défaut, mauvais fichier

Le signalement disait « `athlete-progress.service.spec` fait `new Date()` ». Faux : ce
fichier n'a **aucun** `new Date()` nu, ses dates sont figées. C'est le **service** qui lit
l'horloge (`athlete-progress.service.ts:121`), et `season-marks.ts:71` ne calcule le
`seasonBest` que si `year === currentYear`.

La correction déplace le correctif : figer les dates du spec ne servirait à rien, il faut
injecter l'horloge — patron déjà présent dans `TeamPulseService`.

### TLX-276 — mécanisme exact, prémisse fausse

Le décalage d'`order` décrit est réel et silencieux. Mais la mesure en base dit qui produit
du 0-basé : **trois séances, toutes `self_logged`**, contre **23 séances de coach toutes
1-basées**, brouillons compris.

Le constructeur est côté coach, une séance libre appartient à l'athlète : **personne ne peut
rééditer une séance 0-basée aujourd'hui.** Défaut latent, priorité basse — mais écrit, parce
que trois évolutions banales le réveilleraient.

### Retenus sans ticket

Les stations PPG perdaient leur durée de travail — **trouvé en écrivant les tests de
TLX-259** et corrigé avec lui ; le genre de trouvaille qu'un test d'aller-retour attrape et
qu'un test ciblé ne voit pas. `workSeconds` supplantant `durationSeconds` sur `interval` a
été **figé explicitement à `false`** dans un test : décision visible, pas oubli. Le
préremplissage de « Durée (min) » du brief est une décision produit.

`duplicateSession` échappe structurellement au contrôle automatique : elle **avait** un
appelant, depuis les modèles seulement. Le contrôle répond « atteignable ? », jamais
« atteignable là où l'utilisateur cherche ? ». Consigné sur TLX-256.

## Vérifié vs supposé

**Mesuré** — les quatre suites après fusion ; la couverture recalculée depuis
`coverage-final.json` ; la base de numérotation des 26 séances du staging par statut ;
l'absence de `useFocusEffect` dans `CompetitionEngageScreen` et sa présence dans
`CoachAssignScreen` ; l'absence de `new Date()` nu dans le spec de progression et sa
présence dans le service ; les gardes du contrôle de TLX-256.

**Supposé / déduit** — que la première passe rouge tenait à la concurrence des deux Jest :
étayé par le message d'erreur et par le fait que la relecture seule passe, mais la collision
n'a pas été reproduite délibérément.

**Non établi** — **aucun des neuf correctifs n'a été rejoué sur appareil.** Aucun ticket
n'est fermé. Les specs d'intégration DB-backed n'ont pas tourné côté correction (Docker
absent), donc la garde d'intégration sur `/coach/dashboard` n'a jamais été exercée.

## Ce qui bloque le rejeu

- **La migration de TLX-268** (`20260821000000_session_comment_notification`) doit être
  appliquée **avant** le déploiement du code : sans le CHECK élargi, l'écriture du feed viole
  la contrainte et le job est rejoué en boucle.
- **Le staging doit être redéployé** — TLX-260, TLX-266, TLX-267, TLX-268 et TLX-256
  touchent le backend, et TLX-252/253 du lot 5 l'attendaient déjà.
- **Reconstruire le client généré** après avoir tiré `main` : le contrat porte un nouveau
  type de notification.

## Suites à donner

- [ ] **Redéployer le staging**, migration d'abord. Préalable à tout rejeu.
- [ ] **Rejouer les neuf sur appareil** — aucun ticket ne se ferme avant.
- [ ] **Surveiller `functions`** au prochain lot : +0,15 point de marge.
- [ ] **QA-04.4** (pouls coach), **QA-06.3/06.4/06.5**, **QA-07**, reste de **QA-08**.
- [ ] **Critère de sortie toujours non tenu** : TLX-272 (bloquant), TLX-273, TLX-270 et
      TLX-271 (majeurs) restent ouverts, et le lot 6 n'en traitait aucun.
