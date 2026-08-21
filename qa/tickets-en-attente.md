# File d'attente des tickets — vide

Ce fichier recueille les défauts **établis et prouvés** qui n'ont pas pu recevoir de numéro
Linear, le temps que le workspace redevienne inscriptible. Il est vide aujourd'hui.

**Convention inchangée** : statut `Backlog`, label `qa-campagne`, même standard de preuve
que les tickets créés. Ce ne sont pas des notes.

## Précédent — 2026-08-21

Le workspace a atteint la limite d'issues de son plan gratuit à **271 issues, aucune
archivée**. Deux défauts ont attendu ici quelques heures, puis ont été créés : **TLX-272**
(bloquant — l'onglet Groupe meurt après un passage par Confidentialité) et **TLX-273**
(« Accès de mon coach » affiche OFF alors que l'accès est ouvert).

### Ce qui débloque, vérifié plutôt que supposé

**Archiver des issues closes libère du quota, et les issues archivées restent lisibles.**
Les deux points ont été mesurés **avant** d'archiver en masse : dix issues archivées d'abord
(TLX-1 à TLX-10), puis relecture de TLX-1 — contenu et références intacts malgré son
`archivedAt` — et création réussie dans la foulée.

Le test à dix a coûté trente secondes, et aurait évité d'archiver 229 issues pour rien si
l'hypothèse avait été fausse.

**Ne pas supprimer, archiver.** L'archivage se défait ; la suppression non. Les tickets de
cette campagne portent des mesures horodatées qu'on ne saurait pas reconstituer.

### Répartition au moment du blocage

| Statut                             | Nombre  |
| ---------------------------------- | ------- |
| Closes (Done, Duplicate, Canceled) | **229** |
| Backlog                            | 29      |
| Todo                               | 10      |
| En cours                           | 3       |

85 % du workspace était du travail terminé occupant des places. Linear sait archiver
automatiquement les issues terminées après un délai, dans les réglages de l'équipe — à
activer, sinon le plafond reviendra.

### Si ça se reproduit

1. Écrire le défaut **ici**, au standard habituel, et le committer. Ne pas attendre le
   déblocage pour le rédiger : c'est à chaud que la preuve est complète.
2. Le référencer par son **titre** dans le lot de correctifs, en précisant qu'il est sans
   numéro et où le lire.
3. Une fois créé, remplacer les renvois par le numéro dans le lot **et** dans le rapport de
   session, puis vider cette section.
