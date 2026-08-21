# Rapport de campagne — 2026-08-21 (après-midi) — QA-04 clos, QA-06.1/06.2, intégration du lot 5

Huitième session. **QA-04 est terminé**, **QA-06.1 et QA-06.2 sont déroulés**, et le lot 5
est intégré après avoir été livré à moitié — pour une raison qui mérite d'ouvrir ce rapport.

**Sept défauts ouverts, dont un bloquant et trois majeurs. Un fermé sur rejeu.** Le CI
repasse au vert après deux jours de rouge.

## Contexte

|              |                                                                                 |
| ------------ | ------------------------------------------------------------------------------- |
| Appareil     | Android S20 FE — athlète `+qa-a3` (Zoe), coach et `+qa-athlete2` par script     |
| `main`       | `c6a0869` au début, `bb0aa5e` à la fin (lot 5 intégré)                          |
| Suite mobile | 120 suites, **1165 tests verts** — couverture **88,52 / 80,88 / 85,04 / 90,33** |
| Suite API    | 72 suites, **695 tests verts**                                                  |
| Staging      | inchangé — **non redéployé**, ce qui bloque le rejeu de TLX-252/253             |

## Le lot 5 a été traité à moitié, et la cause est instructive

La session de correction a rebasé sur **`84678d4`**, l'état de son worktree, au lieu de
`main`. Les trois commits d'écart « n'ajoutaient que des `.md` dans `qa/` » — et **l'un de
ces `.md` était le prompt du lot**. Elle a donc travaillé sur une autre liste.

| Lot 5 tel qu'écrit                                               | Livré                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| TLX-254, **TLX-259**, **TLX-257**, TLX-223, **TLX-244**, TLX-248 | TLX-254, TLX-223, TLX-249+247, TLX-248, TLX-252, TLX-253 |

Trois se recouvrent, quatre bonus utiles, **et les trois pièces les plus lourdes du lot sont
restées sur la table**. Aucune n'était perdue, mais la perte de temps est réelle.

Le lot 6 s'ouvre désormais sur `git fetch origin && git rebase origin/main`, et **sa ligne
« Base » ne nomme délibérément aucun SHA** : nommer un point fixe est précisément ce qui a
coupé le lot en deux.

## Intégration du lot 5

Six branches rebasées sur `main` puis fusionnées en `--ff-only`. Les trois conflits annoncés
par la session de correction sont tombés exactement où elle l'avait dit, résolus selon ses
consignes — les deux amendements d'ADR-36 conservés, la version TLX-248 du journal retenue
avec la mention TLX-253 insérée, le mock `deleteTrainingLogSession` gardé une fois.
Résolution **par script** : ces textes sont longs et une reprise manuelle y perd une ligne
sans que rien ne le signale.

**Vérification après fusion, pas branche par branche** — c'est la leçon des deux lots
précédents. Couverture reproduite indépendamment, au centième près des chiffres annoncés.
**Le CI sort du rouge où il était depuis le 19/08.** Marge sur les branches : +0,88 point.

Un piège au passage : le typecheck mobile a d'abord échoué sur
`has no exported member 'LinkedUserSummary'`. La source était juste — `packages/api-client/dist/`
est hors dépôt et `tsc` résout le paquet vers ses types **construits**. Un
`pnpm --filter @talent-x/api-client build` suffit. Le symptôme ressemble à une régression de
la branche fraîchement fusionnée, ce qu'il n'est pas ; c'est écrit dans le lot 6.

## Résultats par scénario

| Scénario                          | Verdict   | Preuve                                                     |
| --------------------------------- | --------- | ---------------------------------------------------------- |
| QA-04.6 — kudos, côté receveur    | ✅ + ❌❌ | asymétrie ADR-10/ADR-55 **vérifiée** — TLX-266, TLX-267    |
| QA-04.7 — discussion de séance    | ✅ + ❌❌ | 403/204 et soft-delete conformes — TLX-268, TLX-269        |
| QA-06.1 — retrait du consentement | ✅ + ❌❌ | `403 CONSENT_REQUIRED` conforme — TLX-270, TLX-271         |
| QA-06.2 — accès coach, par coach  | ✅ + ❌❌ | **5/5 portes, puis 6/6 rouvertes** — 2 défauts sans numéro |
| Rejeu TLX-243                     | ✅ fermé  | record 30 m créé, 40 m intact                              |

## Ce que cette session a établi de plus utile

### L'asymétrie push / in-app se vérifie, et une seule fois

QA-04.6 était le **seul** scénario de la campagne où l'asymétrie ADR-10 / ADR-55 pouvait
être observée. Elle est **conforme** : bannière générique « Quelqu'un de ton groupe t'a
envoyé des encouragements 👏 » sans aucun nom, feed in-app nommant Alex, cloche incrémentée
seule.

Le dispositif a demandé d'**inverser le sens du test**. `device_tokens` ne contient qu'une
ligne, celle de Zoe : le kudos de 12:16:08 partait de l'appareil vers un compte **sans
jeton** et n'aurait produit aucune bannière. Faire basculer l'appareil sur le receveur aurait
déplacé le jeton et détruit le seul témoin disponible. C'est donc le donneur qui a été
piloté par script.

### Une chronologie a évité une conclusion inversée

Sur QA-06.1, le rapport initial était « j'ai remis le consentement sur ON et je ne vois
toujours pas mes perfs », pendant qu'une sonde API renvoyait `403` — ce qui semblait donner
tort à l'écran et innocenter le produit.

Les horodatages ont tranché : consentement **accordé à 14:57:29**, retiré à **14:59:16**,
sonde lancée après. **L'observation avait bien eu lieu consentement actif.** Sans cette mise
en ordre, TLX-270 passait pour un comportement correct.

C'est la deuxième fois cette semaine qu'une sonde correcte, lancée au mauvais moment, dit
l'inverse de la vérité.

### Un « non établi » qui était vrai, et un qui ne l'était pas

Deux crashs ont été signalés. Le premier, sur l'écran de confidentialité, **n'a pas été
reproduit** à la demande — il a donc été consigné comme **non établi**, sans ticket.

Le second, sur l'onglet Groupe, a d'abord été attribué à ma propre reconstruction de
`api-client/dist/` sous un Metro actif — un piège documenté du projet. **Cette attribution
était fausse.** Metro relancé avec `--clear`, le crash persiste, et la trace complète donne
un défaut net.

Elle explique aussi rétrospectivement le premier crash **et** l'échec de sa reproduction :
le défaut n'apparaît que si l'onglet Groupe a été **monté au préalable**. Sans cette visite,
aucun observateur ne consomme la valeur empoisonnée et rien ne plante. Le classement en
« non établi » était le bon réflexe avec les éléments d'alors, et la conclusion était
fausse.

### Le bloquant est TLX-238, à seize lignes près

`MY_GROUPS_QUERY_KEY = ['groups','mine']` a **quatre producteurs**. Trois écrivent le tableau
déballé, `PrivacySection` écrit l'enveloppe `{ data }`. Chaque `useQuery` type le sien :
quatre annotations localement correctes et mutuellement contradictoires, que le compilateur
ne peut pas rapprocher.

L'onglet Groupe est une racine que React Navigation ne démonte jamais (ADR-58). Il reste
abonné à la clé, et **meurt d'une valeur écrite par un écran que l'athlète vient d'ouvrir
ailleurs**.

Le point remarquable : la documentation de `coachGroupsQuery()`, dans le même fichier,
décrit ce défaut **mot pour mot, symptôme `groups.map is not a function` compris**. Le
correctif de TLX-238 a couvert `['groups']` et s'est arrêté seize lignes avant
`['groups','mine']`, laissée en clé nue sans producteur. Diagnostic juste, périmètre trop
étroit — exactement le motif de TLX-244.

### L'écran de confidentialité affiche l'inverse de la réalité

Le propriétaire a signalé, en passant, que « accès de mon coach était déjà désactivé ». Il ne
l'était pas : au même instant, **six portes coach sur six étaient ouvertes**.

L'interrupteur mono-coach ne lit que les lignes de consentement **non scopées**, alors que
l'adhésion par code dépose une ligne **scopée** (ADR-51 §D2). **Tout athlète du produit** est
dans ce cas. Et le sens de l'erreur est le mauvais : celui qui veut couper l'accès croit que
c'est déjà fait et repart rassuré à tort.

**La garde serveur a été vérifiée avant de conclure** — elle prend la ligne applicable la
plus récente, dans les deux sens. Ce n'est donc pas une faille d'accès mais un affichage qui
ment, et le contrôle fonctionne quand on s'en sert. La distinction n'est pas cosmétique :
elle sépare un défaut d'interface d'un bloquant de sécurité.

### Quatre attendus de fiches corrigés

`assignment_kudos` n'existe pas — la table est `participation_kudos`. `consents` n'a pas de
colonne `updated_at`. `deleteComment` n'a **aucun appelant mobile**, donc l'étape « B
supprime son commentaire » n'était pas exécutable. Et QA-06.2 annonçait « 6 portes » en 403 :
il y en a **cinq**, la sixième — le tableau de bord — **dégrade** en `200` avec
`coachAccessGranted: false`. Attendre un refus dessus aurait produit un faux défaut.

En revanche, un doute que j'avais soulevé était infondé : `consents` **est** append-only, une
ligne par bascule. La fiche disait vrai.

## Vérifié vs supposé

**Mesuré** — le jeton push unique et son porteur ; les notifications de kudos et leur
`resource_id`, formellement la séance et non l'affectation ; le silence du worker à chaque
envoi accepté ; l'unicité de l'entrée de feed après retrait/renvoi et son `read_at` antérieur
au second push ; les zéros de notification de QA-04.7 **avec témoin positif** (13
notifications le même jour) ; les codes 403/204 et le `deleted_at` des commentaires ; les
six bascules de `data_processing` et les quatre de `coach_access`, horodatées ; les cinq
portes coach en 403 puis les six rouvertes ; l'appartenance au groupe et le lien coach
intacts pendant la révocation ; le record 30 m créé et le 40 m absent ; le `results` à un
seul `setResult` pour un exercice qui en définit huit ; la couverture après fusion.

**Supposé / déduit** — que `CoachReviewScreen` reste bloqué après un rétablissement de
`coach_access`, comme `ProgressScreen` : lu dans le code, **non observé** (demande l'appareil
en coach). Et qu'un consentement global déposé par méprise s'appliquerait à un futur second
coach : lecture de la garde, non mesuré.

**Non établi** — le crash de l'écran de confidentialité pris isolément. Il est
vraisemblablement le même défaut que celui de l'onglet Groupe, mais sa trace n'a pas été
capturée sur le moment.

## Défauts ouverts à l'issue de la session

| Réf                | Sév.         | Objet                                                           |
| ------------------ | ------------ | --------------------------------------------------------------- |
| **sans numéro §2** | **Bloquant** | l'onglet Groupe meurt après un passage par Confidentialité      |
| **sans numéro §1** | **Majeur**   | « Accès de mon coach » affiche OFF alors que l'accès est ouvert |
| **TLX-270**        | Majeur       | rétablir un consentement ne rétablit aucun écran                |
| **TLX-271**        | Majeur       | une perf saisie partiellement ne peut plus être complétée       |
| TLX-266            | Medium       | taper une notification de kudos ouvre un écran d'erreur         |
| TLX-268            | Medium       | la discussion de séance ne prévient personne                    |
| TLX-269            | Medium       | aucun écran de détail n'a de tirer-pour-rafraîchir              |
| TLX-267            | Low          | retirer puis renvoyer un kudos pousse sans rien ajouter au feed |

**Linear a atteint la limite d'issues de son plan gratuit** en cours de session. Les deux
premiers sont donc dans `qa/tickets-en-attente.md`, au même standard de preuve, à créer dès
que la limite est levée.

**TLX-243 est fermé** sur rejeu appareil, et **TLX-256 complété** d'un quatrième cas.

## Suites à donner

- [ ] **Le lot 6 est prêt** — `qa/correctifs/2026-08-21-lot-6.md`, treize points, le bloquant en tête.
- [ ] **Critère de sortie non tenu** : le plan exige zéro défaut bloquant ou majeur ouvert. Il y en a quatre.
- [ ] **Redéployer le staging** avant de rejouer TLX-252/253 : ils changent le contrat API.
- [ ] **Rejeux mobiles possibles sans redéploiement** : TLX-249 (entrée séance libre) et TLX-223 (essais par barre).
- [ ] **QA-04.4** (pouls d'équipe côté coach) à la prochaine bascule. Prédiction recalculée après la perf de QA-06.1 : **2 séances réalisées · 0 record · 100 % de présence**, semaine du 17/08.
- [ ] **QA-06.3/06.4/06.5**, **QA-07**, reste de **QA-08**. QA-06.4 (export, écart MinIO/OVH) reste le scénario le plus lourd non déroulé.
- [ ] **Vérifier `CoachReviewScreen`** après un rétablissement de `coach_access` — déduit, non mesuré.
