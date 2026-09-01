# ADR-59 — Notification de la discussion de séance : type `session_comment` et fan-out par rôle

- **Statut :** Accepté (2026-08-21 — périmètre arbitré par le propriétaire : la discussion reste au MVP)
- **Date :** 2026-08-21
- **Réf. :** TLX-268 (défaut mesuré) · TLX-118 (fil de séance livré sans canal d'alerte) · ADR-22 (taxonomie des notifications) · ADR-23 (feed in-app, déduplication) · ADR-46 (patron d'extension du CHECK, réutilisation d'une préférence) · ADR-10 (push générique) · ADR-55 (feed nominatif) · ADR-30 (fan-out d'affectation) · TLX-266 (le `resourceId` doit être navigable **par son destinataire**) · scénario QA-04.7

**Contexte.**

L'écran athlète invite « **Pose une question à ton coach.** » L'athlète la pose. Le coach n'en
est jamais informé. Le coach répond — dans la vraie vie, il aurait fallu qu'il rouvre la séance
par hasard. L'athlète n'est jamais informé non plus.

Mesuré sur appareil (QA-04.7, 2026-08-21) : question postée à `12:50:05`, **0 notification** ;
réponse du coach à `12:51:14`, **0 notification**. La même sonde comptait 13 notifications émises
ce jour-là — le zéro est une mesure, pas une sonde cassée.

La cause n'est pas un oubli d'implémentation isolé. `comments.service.ts` ne porte qu'un seul
chemin de notification, gardé par `target === 'performance'` : la cible **séance** n'est traitée
nulle part, dans aucun des deux sens. Et la taxonomie d'ADR-22 n'a **aucun type** pour un
commentaire de séance. Le fil a été livré (TLX-118) sans son canal d'alerte, et aucune ligne de
code ne pouvait le signaler puisque le type manquait à la racine.

Une boîte aux lettres que personne ne relève est pire qu'une absence de fonctionnalité :
l'athlète croit avoir posé sa question à quelqu'un.

**Décision.**

### D1 — La discussion de séance reste au MVP, avec un type dédié

Périmètre arbitré : on garde la fonctionnalité et on lui donne son canal. Nouveau type
`session_comment` dans la taxonomie ADR-22, **CHECK étendu par migration additive** — exactement
le patron d'ADR-46 pour `group_announcement` puis d'ADR-50 pour `group_reply`.

L'alternative (retirer la section, ou l'afficher en lecture seule) est écartée : le fil est
techniquement complet et correct — cible séance portée, lecture coach, suppression douce, 403 sur
le commentaire d'autrui — il ne lui manquait que d'être annoncé.

### D2 — Fan-out : le fil est **commun**, pas un canal privé

- **Question d'athlète → le coach propriétaire de la séance.** Un seul destinataire.
- **Réponse du coach → tous les athlètes affectés à la séance.** Le fil est attaché à la séance
  et lu par tous ses affectés (fan-out ADR-30) : notifier le seul demandeur laisserait les autres
  découvrir la réponse par hasard, alors qu'ils la voient.

Deux exclusions, conformes à l'arbitrage :

- **L'auteur ne se notifie jamais lui-même.** Le coach qui répond est exclu du fan-out athlète
  par construction (il n'est pas affecté) ; la garde est écrite explicitement quand même, parce
  qu'un coach peut être athlète ailleurs et que la protection ne doit pas dépendre du modèle.
- **Un athlète qui répond ne notifie pas les autres athlètes.** Seul le coach est prévenu. Sans
  cette borne, un fil à dix affectés devient une chambre d'écho : chaque message de chacun
  réveillerait les neuf autres.

### D3 — Le `resourceId` est **celui que son destinataire sait ouvrir**

C'est la décision que TLX-266 impose de prendre explicitement, et le piège à ne pas rejouer.

| Destinataire | Écran ouvert | `resourceId` émis |
| --- | --- | --- |
| Coach | `(coach)/session/[id]` — consomme un **identifiant de séance** | `sessionId` |
| Athlète | `(athlete)/session/[id]` — consomme une **affectation** (`getAssignment`) | **son** `assignmentId` |

Le même `resourceId` ne peut pas servir les deux : les deux routes portent le même nom et ne
prennent pas la même chose. `notificationHref` dérivant déjà sa cible du **rôle** du lecteur, il
suffit que chaque notification émise porte la ressource navigable par **son** destinataire — ce
qui se décide à l'émission, où l'on connaît le destinataire, et non à la lecture.

Conséquence pratique : le fan-out coach → athlètes émet **une notification par affectation**, avec
un `resourceId` différent dans chacune. C'est plus verbeux qu'un identifiant unique partagé, et
c'est le prix de la justesse.

### D4 — Préférence : réutiliser, ne pas ajouter

`session_comment` est gardé par **`performanceFeedback`**, et non par une nouvelle colonne.

ADR-46 a établi qu'on réutilise la garde existante la plus proche plutôt que d'en créer une —
chaque colonne nouvelle est un écran de réglages de plus, une migration, et un défaut par défaut à
choisir. Parmi les quatre gardes existantes, `performanceFeedback` est la bonne : elle couvre déjà
« mon coach m'a écrit à propos de mon travail », et le commentaire de séance est la même
conversation, une étape plus tôt. `groupUpdates` aurait rangé un échange coach ↔ athlète parmi les
nouvelles du groupe ; `sessionAssigned` parle d'affectation, pas de dialogue.

**Limite assumée** : couper `performanceFeedback` coupe aussi les questions de séance. C'est
cohérent — c'est le même canal humain — mais ce n'est pas séparément réglable. Si le besoin
apparaît, la colonne dédiée reste une migration additive.

### D5 — Contenu

Push **générique** (ADR-10) : titre et corps fixes par type, aucun extrait du message, aucun nom.
`actorId` capturé à l'émission pour la résolution nominative du **feed in-app** (ADR-55) — le
lecteur voit « Alex a écrit sur une séance », le push reste muet sur l'identité.

Déduplication : `dedupeKey` dérivé de l'identifiant du **commentaire** et du destinataire
(`session_comment--<commentId>--<recipientId>`). Deux destinataires distincts d'un même message
sont deux entrées de feed ; un job rejoué reste un doublon. Le destinataire doit figurer dans la
clé, sans quoi le fan-out se dédupliquerait contre lui-même et un seul athlète serait servi.

**Conséquences.**

- Positives : la fonctionnalité tient enfin sa promesse dans les deux sens ; zéro nouvelle table,
  zéro colonne, une migration additive et réversible ; le patron ADR-46/50 est suivi à
  l'identique, donc rien de neuf à comprendre pour la prochaine extension.
- Négatives : le fan-out coach → athlètes est **en O(affectés)** — une séance de groupe à trente
  athlètes produit trente jobs pour une réponse. Acceptable au MVP (les jobs sont légers et la
  file les absorbe), à surveiller si les groupes grossissent. Et `performanceFeedback` devient une
  garde à double usage, cf. la limite de D4.
- Le CHECK étendu doit être appliqué **avant** le déploiement du code qui émet le type, sous peine
  d'échec d'écriture du feed sur la contrainte.

**Le cas à ne pas oublier — vérifié, et il n'est pas théorique.**

Le fil côté athlète **disparaît dès qu'une performance est soumise** : `SessionDetailScreen`
bascule alors sur le fil de la **performance**, et le fil de séance n'est plus rendu. Or la
séquence normale est exactement celle-là : l'athlète pose sa question avant la séance, la fait,
saisit sa perf — et la réponse du coach arrive après.

Notifier vers un écran où le fil n'est plus visible serait un nouveau TLX-266 : un tap qui mène
nulle part. La décision est donc que **le fil de séance reste rendu après la soumission**, en plus
du fil de performance, plutôt que remplacé par lui. Les deux fils portent des conversations
différentes — l'un sur la séance à venir, l'autre sur la perf réalisée — et rien ne justifiait
que le second efface le premier.

**Alternatives considérées.**

- **Réutiliser `performance_feedback` pour la cible séance.** Écarté : le type est lu par
  `notificationQueryKeys` pour invalider le fil de **performance**, et par la présentation pour
  écrire « Ton coach a commenté une performance ». Le détourner rendrait faux, d'un coup, un
  libellé, une clé de cache et un commentaire — la mécanique même qui a produit TLX-266.
- **Notifier le seul auteur de la question plutôt que tous les affectés.** Écarté par D2 : le fil
  est commun et affiché à tous ; ne prévenir qu'une personne d'un contenu que dix voient est une
  incohérence de plus, pas une économie.
- **Une colonne de préférence dédiée.** Écarté par D4, avec la limite écrite.
- **Différer la fonctionnalité (retirer la saisie).** Écarté par l'arbitrage : le fil marche, il
  ne manquait que son canal.
