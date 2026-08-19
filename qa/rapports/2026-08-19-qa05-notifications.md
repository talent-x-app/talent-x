# Rapport de campagne — 2026-08-19 — QA-05 Notifications

Troisième session de la journée, enchaînée sur la clôture du lot 1. **QA-05 est déroulé
en entier côté athlète : cinq scénarios sur six sont conformes, le sixième
(`group_update` sur appareil coach) reste bloqué faute d'un coach sur téléphone.**

**Trois défauts ouverts, dont deux majeurs.** Le premier rompt le parcours « le coach
commente, l'athlète lit » à son dernier maillon ; le second fait mentir par omission le
centre de notifications, qui est pourtant l'historique censé faire foi.

## Contexte

|                      |                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------ |
| Commit déployé (API) | `3608921` → image `sha-360892142e…` — inchangé depuis le rejeu du lot 1              |
| Véhicule mobile      | dev client + Metro sur `main` fusionné (`d710ad1`)                                   |
| Appareil             | Android S20 FE                                                                       |
| Comptes QA           | `+qa-athlete` (appareil), `+qa-coach` (piloté par script) — boîtes réelles           |
| Groupe               | « QA — Push et notifications » `e65aed91` — créé pour la campagne, coach `+qa-coach` |
| Préflight            | hérité de la session précédente (même image, même pile)                              |

## Résultats par scénario

| Scénario                                        | Verdict         | Preuve                                                                                            |
| ----------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| QA-05.1 — enregistrement à la connexion         | ✅              | 1 ligne `device_tokens`, `fcm`, `revoked_at` nul, liée au bon compte                              |
| QA-05.2 — `session_assigned` (premier plan)     | ✅              | bannière affichée, worker muet ; contenu générique conforme ADR-10                                |
| QA-05.2 — `performance_feedback` (arrière-plan) | ✅              | bannière système, tap → détail de la séance ; `12:39:15.668`                                      |
| QA-05.2 — pas de doublon                        | ✅              | deux `dedupe_key` distincts par affectation, aucune ligne écrasée                                 |
| QA-05.3 — `group_update` sur appareil coach     | ⏭ **non joué** | exige le coach connecté sur un téléphone — traité en QA-02                                        |
| QA-05.4 — badge à l'arrivée d'un push           | ✅ **TLX-231**  | badge incrémenté **sans navigation** — voir le rapport du rejeu du lot 1                          |
| QA-05.4 — navigation au tap                     | ✅              | `resourceId` = affectation → `/(athlete)/session/[id]`, atterrissage conforme                     |
| QA-05.4 — lecture unitaire                      | ✅              | trois `read_at` **échelonnés** (`12:48:21.168`, `:23.721`, `:30.797`) — badge 3 → 2 → 1 → 0       |
| QA-05.4 — « Tout marquer lu » (TLX-189)         | ✅              | deux `read_at` **identiques à la ms** (`13:09:01.145`) ; **8 lignes, 8 lues, 0 supprimée**        |
| QA-05.5 — préférence coupée                     | ✅              | `Notification ignorée (préférence off)` + **zéro ligne** créée (total figé à 8)                   |
| QA-05.5 — préférence rétablie                   | ✅              | ligne à `13:21:10.27`, worker muet — le chemin n'était pas cassé, il était coupé                  |
| QA-05.5 — marketing opt-in (RGPD)               | ✅              | `marketing = false` en base, seule bascule désactivée à l'état initial                            |
| QA-05.6(a) — déconnexion                        | ✅              | `revoked_at` posé à `13:23:03.882`, **0 device actif** ; puis « sans cible » mais **ligne créée** |
| QA-05.6(b) — reconnexion                        | ✅              | `revoked_at` de nouveau nul sur la **même** ligne, push rétabli (worker muet)                     |
| QA-05.6(c) — changement de compte               | ✅              | même jeton natif, titulaire `+qa-reset` → `+qa-athlete`, **1 seule ligne** — upsert §4.6          |
| — détail de séance après saisie                 | ❌ **TLX-236**  | l'écran reste en mode saisie ; le fil de feedback devient inaccessible                            |
| — push reçu app en arrière-plan                 | ❌ **TLX-237**  | l'entrée n'apparaît jamais dans le centre — jusqu'au push suivant reçu au premier plan            |
| — rafraîchissement de la ressource              | ❌ **TLX-235**  | la cloche bouge, la liste des séances non                                                         |

## Défauts ouverts pendant la campagne

| Ticket      | Sévérité   | Scénario | Résumé                                                                          |
| ----------- | ---------- | -------- | ------------------------------------------------------------------------------- |
| **TLX-236** | **majeur** | QA-05.2  | Le mode saisie persiste entre séances → le feedback du coach est illisible      |
| **TLX-237** | **majeur** | QA-05.6  | Un push reçu app en arrière-plan n'apparaît jamais dans le centre               |
| TLX-235     | mineur     | QA-05.4  | À l'arrivée d'un push, seule la cloche est invalidée — la ressource reste figée |

### TLX-236 — le défaut qui compte

Symptôme rapporté à l'écran : « je ne vois pas le commentaire du coach ». La chaîne était
pourtant intacte de bout en bout — commentaire en base, `GET /comments` le renvoie, push
reçu, tap correctement routé. **Tout fonctionnait sauf le dernier pixel.**

Cause, en deux faits inoffensifs pris séparément :

1. `mode` est un `useState` local, et `session/[id]` est un `Tabs.Screen … href: null` —
   un onglet masqué, **jamais démonté**. La valeur initiale `'view'` n'est évaluée qu'à
   la première visite de l'app.
2. Des trois branches d'`onSuccess`, seule celle du **premier enregistrement** oublie
   `setMode('view')` : elle part vers l'écran de confirmation en laissant `mode` à
   `'entry'`. C'est le chemin que tout athlète emprunte la première fois.

Le fil de feedback étant rendu **dans** la branche `mode === 'view'`, il devient
inatteignable. Élargi ensuite par un test de 20 secondes : passer en saisie sur une
séance **contamine toutes les autres**, sans qu'aucun enregistrement soit nécessaire.
Rien ne réinitialise `mode` sur changement d'`id`.

### TLX-237 — le centre ment par omission

Trouvé en toute fin de session, sur une remarque de l'utilisateur : la séance de 15:26
était affichée sur l'accueil mais **absente du centre de notifications**. Ni navigation ni
rafraîchissement ne la faisaient apparaître.

La séquence qui l'isole :

| Heure    | Événement                                            | Centre                      |
| -------- | ---------------------------------------------------- | --------------------------- |
| 15:26:25 | push reçu **app en arrière-plan**, bannière affichée | **absente**                 |
| 15:27→39 | retour au premier plan, navigation, rafraîchissement | **toujours absente**        |
| 15:40:04 | push reçu **app au premier plan**, centre à l'écran  | **15:26 et 15:40 ensemble** |

Les deux ont été lues à `15:41:36` et `15:41:39` — deux lectures unitaires, donc les deux
étaient bien affichées. **L'apparition simultanée est la signature du rattrapage** :
l'invalidation du push suivant recharge toute la liste et ramène ce qui manquait.

Trois manques se composent, dont aucun n'est fautif isolément : l'écouteur d'arrivée ne
se déclenche qu'au premier plan ; `refetchOnWindowFocus: false` sans câblage `AppState`
n'offre aucun relais au retour ; et le centre n'a **ni tirer-pour-rafraîchir, ni
démontage** (onglet masqué). L'utilisateur n'a donc littéralement aucun geste à sa
disposition.

C'est la matérialisation du **point 2 de TLX-231**, écrit le 18/08 comme « arbitrage
produit à rendre ». Le laisser en suspens avait un coût, et le voici : le centre in-app,
présenté par ADR-23 comme l'historique qui fait foi quand le push n'est qu'un confort,
oublie durablement des événements.

**Une précision de l'utilisateur a été décisive** : « l'app n'était pas fermée, j'ai juste
appuyé sur Accueil ». Sans elle, j'aurais cherché du côté d'un cache non purgé au
redémarrage. C'est le rappel que l'état exact de l'app fait partie de la mesure.

## Trois distinctions établies par la mesure

Ce que cette session apporte de plus durable, ce sont trois oppositions que le rapport
peut désormais trancher sans discussion.

**Lecture unitaire vs marquage global.** Trois `read_at` espacés de 2,5 s et 7 s contre
deux `read_at` identiques **à la milliseconde**. Un horodatage commun ne peut venir que
d'une écriture unique en base. Aucune ambiguïté sur ce que l'utilisateur a réellement
fait — un point qui, la veille, avait failli être conclu à tort.

**Préférence coupée vs appareil absent.** Deux gardes, deux endroits, deux effets :

|                    | ligne en base | push | total après |
| ------------------ | ------------- | ---- | ----------- |
| préférence off     | **non**       | non  | 8 → 8       |
| aucun device actif | **oui**       | non  | 9 → 10      |

Une préférence supprime l'événement ; un appareil absent ne rate que la livraison. Onze
millisecondes séparent la création de la ligne du renoncement au push.

**Notification coupée vs action métier.** Préférence coupée, l'affectation existe
quand même (`1d0f2198`, `13:18:00.651`). Une préférence d'alerte n'avale jamais une
donnée — vérifié, pas supposé.

## Vérifié vs supposé

**Mesuré** — chaque ligne du tableau de résultats est adossée à un horodatage de base ou
à une ligne de log citée. Les bannières, la navigation au tap et la décroissance du badge
sont des observations de l'utilisateur sur l'appareil, corrélées à chaque fois avec la
base.

**Supposé / déduit** — (1) le contenu **exact** de la bannière : conforme ADR-10 par
lecture du code (`MESSAGES[type]` + `data: { type, resourceId }`, aucun nom ni titre
transporté), confirmé à l'œil mais non capturé ; (2) l'autorisation de lecture du fil de
commentaires **côté athlète** : `GET /comments?performanceId=…` a été interrogé avec le
compte **coach**, faute d'identifiants pilotables pour `+qa-athlete` ; le code autorise
explicitement le titulaire (`comments.service.ts:144`).

## Deux corrections de la campagne elle-même

**Mon pilote coach produisait des séances homonymes.** Le titre n'embarquait que l'heure
et la minute : deux affectations dans la même minute devenaient indiscernables à l'écran,
juste au moment où un scénario en demandait deux. Secondes ajoutées.

**J'ai failli tirer dans le vide.** Le compte `+qa-athlete` était connecté sur le
téléphone, mais la base disait autre chose : le device était encore au nom de
`+qa-reset`, et le compte n'appartenait à aucun groupe. Envoyer sans vérifier aurait
produit « sans cible » et un faux négatif imputé à la chaîne push. **Lire la base avant
d'envoyer** doit rester le premier geste de tout scénario QA-05.

## Écarts du registre touchés

| Ligne du registre                     | État                                                               |
| ------------------------------------- | ------------------------------------------------------------------ |
| TLX-231 — cloche figée                | **Résolu** — voir rapport du rejeu du lot 1                        |
| TLX-84 — `group_update` jamais validé | **Toujours ouvert** — exige un coach sur appareil, traité en QA-02 |
| TLX-235 (nouveau)                     | **Ouvert**                                                         |
| TLX-236 (nouveau)                     | **Ouvert — majeur**                                                |
| TLX-237 (nouveau)                     | **Ouvert — majeur** ; clôt le point 2 de TLX-231 laissé en suspens |

## Suites à donner

- [ ] **QA-02 — parcours coach sur appareil.** Ferme `group_update` (QA-05.3) et donc la
      partie technique de TLX-84, dont la DoD réclame les trois types sur appareil : deux
      sont acquis.
- [ ] **Lot 2 de correctifs** : TLX-236 et TLX-237 (majeurs), TLX-235. Prompt de
      correction à rédiger dans `qa/correctifs/`.
- [ ] Rejouer QA-05.2 après TLX-236 : le fil de feedback n'a **jamais** été vu par un
      athlète sur appareil, seulement contourné par « Mettre à jour ».
- [ ] **Piste RGPD à vérifier, pas encore un défaut** : `signOut` ne purge pas le cache
      TanStack (aucun `queryClient.clear()` dans `apps/mobile/src/auth/` ni `data/`).
      Enchaîner une déconnexion et une connexion **sur un autre compte** en moins de
      30 s (`staleTime`) pourrait afficher au second les données du premier. Constat de
      **lecture de code, non reproduit** — à jouer en QA-01 ou QA-06 avant d'ouvrir un
      ticket.
