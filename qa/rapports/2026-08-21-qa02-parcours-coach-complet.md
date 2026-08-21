# Rapport de campagne — 2026-08-21 — QA-02 complet + rejeu du lot 4

Septième session. **QA-02 est déroulé intégralement**, les six scénarios gelés depuis le
19/08 ayant été débloqués par la fusion du lot 4.

**Quatre défauts fermés sur rejeu, huit ouverts.** Aucun bloquant. Mais le parcours coach
sort de cette session avec trois motifs répétés — des gestes destructifs mal cadrés, des
opérations du contrat sans appelant, et un statut `draft` qui ne protège rien.

## Contexte

|              |                                                                         |
| ------------ | ----------------------------------------------------------------------- |
| Appareil     | Android S20 FE — `+qa-coach`, athlètes pilotés par script               |
| `main`       | `c82c6c6` (lot 4 fusionné) puis `84678d4`                               |
| Suite mobile | 119 suites, 1121 tests verts — **CI rouge sur la couverture** (TLX-254) |
| Staging      | 7 conteneurs, inchangé                                                  |

## Rejeu du lot 4 — quatre fermetures

| Ticket      | Vérification décisive                                                                     |
| ----------- | ----------------------------------------------------------------------------------------- |
| **TLX-242** | bascule athlète → athlète, compte d'arrivée **vide en base** : aucune donnée du précédent |
| **TLX-235** | `group_update` à `13:00:51`, la liste des athlètes passe de 1 à 2 **seule**               |
| **TLX-238** | les **trois** sens : pas de crash, 2 groupes à l'affectation, liste intacte au retour     |
| **TLX-245** | séance B **déjà en cache**, confirmation non armée                                        |

Trois de ces rejeux tenaient à un détail de méthode, et sans lui ils auraient menti.

**TLX-242** : une bascule vers le compte coach aurait été un test plus faible — le rôle
change, la navigation entière est remplacée, l'accueil athlète n'est jamais rendu.
L'absence de fuite n'aurait rien prouvé. D'où le passage par un second compte athlète,
**vérifié vide en base** avant le test.

**TLX-245** : ma consigne initiale était mauvaise. Le bloc de suppression n'est rendu que
si la séance est chargée ; sur une séance neuve il se démonte et l'état retombe tout seul.
**Le défaut n'existait que si la séance suivante était déjà en cache.** Sans les deux
visites préalables, le test aurait été vert par accident.

**TLX-235 : j'ai failli le déclarer en échec.** La sortie de groupe n'a rien mis à jour à
l'écran. Vérification avant de conclure : **zéro notification en base, worker muet** — le
code n'émet `group_update` que dans la branche `if (created)` de l'adhésion. Le correctif
n'avait rien à invalider. C'est la ré-adhésion qui l'a prouvé.

## Résultats par scénario

| Scénario                               | Verdict     | Preuve                                                                    |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| QA-02.2 — construire une séance        | ✅          | aucun crash ; la séance d'hier, créée **pendant** le crash, était intacte |
| QA-02.3 — détail, édition, suppression | ✅ + ❌❌   | titre modifié tracé — **TLX-256**, **TLX-259**                            |
| QA-02.4 — affectation                  | ✅ + ❌❌   | **fan-out sans doublon ni re-notification** — TLX-257, TLX-258            |
| QA-02.5 — suivre et commenter          | ✅          | chaîne d'acteur ADR-55 **de bout en bout**, première de la campagne       |
| QA-02.6 — dashboard et stats           | ✅ + ❌❌   | cloisonnement prouvé à l'écran — TLX-259, TLX-260                         |
| QA-02.7 — compétitions                 | ✅ + ❌❌❌ | TLX-256, TLX-261, TLX-262                                                 |

## Ce que cette session a établi de plus utile

### Le cloisonnement ADR-51 §D3 tient, et la preuve est serrée

La fiche de l'athlète affiche **3/4 réalisées, 75 %** — exactement les chiffres calculés
en base pour les affectations **visibles du coach** (4 sur 7, les 3 autres étant des
séances libres). Une fuite aurait donné 6/7 et 86 %.

Le point décisif est ailleurs. La progression vue coach contient un `sprint:60m` à
**6,39 et 6,65** — les marques des séances du coach — et **pas 7,9 / 7,48 / 7,11**, celles
des séances libres. **Même clé d'épreuve, seules les siennes.** Un filtre grossier aurait
tout laissé passer. Et « Revue des séances » liste trois séances, aucune libre.

### Trois gestes destructifs, trois cadrages incohérents

| Geste                     | Confirmation                                 | Portée                        |
| ------------------------- | -------------------------------------------- | ----------------------------- |
| Quitter un groupe         | ✅                                           | soi-même                      |
| Supprimer une séance      | ✅                                           | ses propres athlètes          |
| Supprimer sa photo        | ❌ _(sous un « Annuler » qui n'annule rien)_ | soi-même, **irréversible**    |
| Supprimer une compétition | ❌ _(rien du tout)_                          | **tous les athlètes engagés** |

Le geste le plus large est le seul qui ne demande rien. Le patron existe (ADR-44 §6) et
n'est pas appliqué. Le correctif utile n'est pas un quatrième cas particulier.

### Trois opérations du contrat n'ont aucun appelant

`archiveSession`, `unengageAthlete`, et `duplicateSession` hors modèles. Implémentées,
testées côté API, publiées dans le client généré — **jamais appelées**. Les trois ont été
trouvées **une par une, par hasard**, parce que l'utilisateur cherchait un bouton.

La plus gênante est `unengageAthlete` : archiver est un confort, dupliquer un gain de
temps, mais **désengager corrige une donnée devenue fausse**. Un athlète blessé reste
engagé pour toujours.

Le correctif durable est un contrôle automatique — chaque `operationId` doit avoir un
appelant, ou une absence déclarée. Le patron existe déjà : `app/routes-key.test.ts`
découvre ses cibles sur le disque au lieu de les énumérer.

### `draft` ne protège rien, et pas seulement pour les séances

Une séance en brouillon est assignable, l'athlète la voit et peut l'ouvrir. Une
compétition en brouillon est visible de ses engagés. Dans les deux cas, la ressource reste
étiquetée « brouillon » côté coach **après avoir été distribuée**. Un seul arbitrage à
rendre pour les deux.

### La règle d'ADR-58 est nécessaire mais pas suffisante

TLX-257 le démontre sur **la seule route qui portait déjà sa clé**. Son commentaire dit où
s'arrête la protection : « naviguer vers l'assignation d'une **autre** séance ». Revenir
sur **la même** ne change pas la clé, ne remonte rien, et l'écran de succès réaccueille le
coach — qui ne peut plus jamais affecter cette séance à personne d'autre.

`key={param}` traite le changement de ressource, pas la ré-entrée après un parcours
terminé. `routes-key.test.ts` ne peut pas l'attraper : la clé est bien là.

### Un correctif à moitié appliqué (TLX-244)

Le compteur de période dit « 2 marques » — prouvé sur le seul jeu de données qui
discrimine, deux marques le même jour. Mais deux lignes plus bas, la ligne de saison dit
« 1 marque » pour **les mêmes deux marques** : le serveur compte des jours dans
`marksByYear`. **La contradiction a changé de place au lieu de disparaître.** Le
raisonnement du correctif était juste, son périmètre trop étroit.

## Ce que la campagne s'est corrigé à elle-même

**La matrice de couverture de l'annexe A était fausse deux fois.** Elle annonçait
`duplicateSession` / `archiveSession` couverts par `E2E:tlx-194, coach-misc`, et
`unengageAthlete` par `E2E:tlx-85`. Vérification : `tlx-194-delete.spec.ts` ne couvre que
la suppression, et **aucun E2E ne mentionne** archivage, duplication ou désengagement —
aucun ne le pourrait, il n'y a pas d'interface à piloter.

Toujours le même mécanisme : une couverture **supposée depuis le contrat** au lieu d'être
vérifiée dans le code. Lignes corrigées.

## Vérifié vs supposé

**Mesuré** — les deux affectations du fan-out et l'absence de doublon pour l'athlète déjà
affectée ; les notifications et leurs `actor_id` ; le silence du worker sur chaque envoi
accepté, et ses lignes « sans cible » quand il n'y en avait pas ; la couverture de branches
sur `coverage-final.json` ; les `durationSeconds` avant/après édition sur trois séances
issues du même script ; l'ACWR recalculé à la main sur les deux athlètes ; le contenu de
`marksByYear` servi par l'API ; l'absence des marques libres dans cinq lectures coach,
**avec témoin positif** côté athlète ; les 404 sur la compétition supprimée.

**Supposé / déduit** — rien. Chaque observation d'écran est corrélée à une ligne en base,
une trace serveur ou une lecture de code.

**Non tranché** — la ligne d'engagement survit à la suppression de sa compétition
(invisible côté athlète, vérifié). À regarder côté purge ADR-14/15, pas un défaut.

## Défauts ouverts à l'issue de QA-02

| Ticket      | Sév.   | Objet                                                             |
| ----------- | ------ | ----------------------------------------------------------------- |
| **TLX-254** | High   | CI rouge — 8 branches de couverture manquantes                    |
| **TLX-257** | High   | le coach ne peut plus réaffecter une séance déjà affectée         |
| **TLX-259** | High   | modifier une séance efface la durée de ses bornes → charge à zéro |
| TLX-255     | Medium | le départ d'un athlète est silencieux pour le coach               |
| TLX-256     | Medium | trois opérations du contrat sans appelant                         |
| TLX-258     | Medium | brouillons diffusés — séances **et** compétitions                 |
| TLX-260     | Medium | ACWR figé à 4,00 → « Surcharge » sur tout nouvel athlète          |
| TLX-261     | Medium | les compétitions n'ont plus d'entrée directe                      |
| TLX-262     | Medium | supprimer une compétition sans confirmation                       |
| TLX-244     | Low    | **à moitié corrigé** — `marksByYear` compte encore des jours      |

## Suites à donner

- [ ] **TLX-254 d'abord** : `main` est rouge depuis la fusion du lot 3, la publication GHCR est sautée.
- [ ] **Rejeu de TLX-243** côté athlète : la carte de rattrapage de record, jamais vue sur appareil.
- [ ] **QA-04** (social), **QA-06** (RGPD), **QA-07** (hors ligne), reste de **QA-08**.
- [ ] **QA-06.2** portera deux questions laissées ouvertes ici : le consentement `coach_access`
      n'est ni révoqué à la sortie ni redemandé à la ré-adhésion ; et un athlète **retiré par son
      coach** est-il prévenu ?
- [ ] **Arbitrages produit en attente** : `draft` diffusable (TLX-258), archivage
      fonctionnalité ou code mort (TLX-256), seuil d'historique minimal pour l'ACWR (TLX-260).
