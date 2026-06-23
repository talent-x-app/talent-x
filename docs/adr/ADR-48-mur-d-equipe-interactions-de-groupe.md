## ADR-48 — « Mur d'équipe » : interactions de groupe par paliers RGPD (réactions agrégées → nominatif → fil)

- **Statut :** Accepté (2026-06-23 — trajectoire validée ; Palier 1 livré TLX-184, Palier 2 cadré par ADR-49)
- **Date :** 2026-06-22
- **Décisions actées (proposées) :** (1) l'interaction de groupe se construit en **3 paliers** d'engagement croissant, ordonnés par **risque RGPD croissant**, et non d'un bloc ; (2) le **Palier 1** (réactions **agrégées**, accusé de lecture agrégé, pouls d'équipe dérivé, présence sociale narrative) n'expose **aucune identité de tiers** → livrable **sans dépendre de l'AIPD**, en réutilisant l'infra annonces (ADR-46) / agrégats (ADR-45) / notifications (ADR-22/23) ; (3) le **Palier 2** (réactions **nominatives** + kudos de participation) lève l'anonymat → **bundlé avec la revue AIPD** déjà due (ADR-37 §4, TLX-150), **jamais** appliqué à la performance/charge (santé, coach-scopée, ADR-08/21) ; (4) le **Palier 3** (fil de discussion bidirectionnel) **rouvre** la décision « pas de chat au MVP » d'ADR-46 et n'est cadrable qu'avec une **couche de modération** explicite ; (5) chaque palier fera l'objet de son **propre ADR d'exécution** — celui-ci fixe la **trajectoire** et les invariants.
- **Réf. :** ADR-46 (annonces de groupe — canal descendant, **complète**) · ADR-45 (agrégat de présence sans noms — **patron d'agrégat**) · ADR-43 §5 (visibilité pair-à-pair de la présence différée à l'AIPD) · ADR-37 §4 (visibilité d'identité pair-à-pair → AIPD requise, TLX-150) · ADR-44 (hub de groupe mince) · ADR-22/23 (infra + feed de notifications) · ADR-08 (RBAC + appartenance + ownership + consentement) · ADR-10 (notification générique, `resourceId`) · ADR-21 (progression/records consent-gated, coach-scopés) · TX-SEC-003 (RGPD) · TX-DPIA-007 (AIPD) · `talent-x-openapi.yaml` · TLX-150 (suivi AIPD).

**Contexte.** Tout ce qui touche au « groupe » côté athlète est aujourd'hui **à sens unique** :
le coach **diffuse** (annonces, ADR-46), l'athlète **déclare** sa présence au coach (RSVP, ADR-43,
remontée en **compteur agrégé** ADR-45), et lit un **trombinoscope minimisé** (ADR-37). Aucun moment
où un coéquipier *réagit*, *encourage* ou *répond*. Le hub mince (ADR-44) a du contenu vivant
(annonces, calendrier) mais **pas d'interaction** — c'est le manque qui empêche le « sentiment
d'équipe ».

La tentation est d'ajouter « un chat de groupe ». Mais l'architecture **minimise délibérément le
social** : ADR-37 §4 et ADR-43 §5 ont **différé toute visibilité d'identité pair-à-pair à l'AIPD**, et
cette AIPD n'est **pas encore validée même pour le simple roster** (TLX-150, backlog). Lâcher de la
conversation nominative sans ce cadre **contournerait une décision de conformité explicite**. Il faut
donc un **gradient** : du plus sûr (agrégats, zéro donnée de tiers nouvelle) au plus engageant
(conversation), chaque marche défendable seule.

**Décision.** Une surface unique — l'onglet **« Mur »** du hub (qui enrichit/remplace l'onglet
« Annonces » d'ADR-46) — alimentée par **trois paliers** livrables indépendamment.

### Palier 1 — Réactions **agrégées** + pouls d'équipe (RGPD-safe, sans AIPD)

Aucune identité de tiers exposée : on applique **partout** le patron d'agrégat d'ADR-45 (l'API ne
ressort que des **entiers**, jamais « qui »).

1. **Réactions emoji sur les annonces.** Table légère
   `announcement_reactions(announcement_id FK, user_id FK, emoji, created_at)` avec **unicité
   `(announcement_id, user_id, emoji)`** (un emoji par personne, togglable). **Le contrat ne ressort
   que des compteurs** : `GroupAnnouncement` gagne `reactions: { emoji, count }[]` + `myReactions:
   emoji[]` (ce que **l'appelant** a posé — sa propre donnée, pas un tiers). Verbes :
   `PUT /groups/{id}/announcements/{aid}/reactions/{emoji}` (pose) /
   `DELETE …` (retire). Jeu d'emoji **borné** côté serveur (`❤️ 🔥 👏 💪 …`, enum) — pas de texte libre.
2. **Accusé de lecture agrégé.** Table `announcement_reads(announcement_id, user_id, read_at)` ;
   l'API ne ressort que `readCount` / `memberCount` (« 9/12 ont lu ») — **jamais la liste**. Donne au
   coach le signal « mon message est passé » sans nominatif (même posture qu'ADR-45).
3. **Carte « pouls d'équipe ».** **100 % dérivée** (esprit ADR-43, zéro champ stocké) : agrégats sur
   les `SessionAssignment` du groupe (fan-out ADR-30) — séances `completed` de la semaine, nombre de
   PR (ADR-20) déclenchés, **série de présence**. Rendu : « 🔥 3 semaines à 100 % · 42 séances · +8
   records ». **Gamification douce, collective et anonyme** (pas de classement individuel — ce serait
   de la donnée de perf comparée entre pairs, exclu §RGPD).
4. **Présence sociale narrative.** On **habille** le compteur agrégé existant (ADR-45) : « 5
   coéquipiers t'attendent jeudi 💪 ». Aucune donnée nouvelle — reformulation d'un agrégat déjà
   exposé.

**Notifications (réutilise ADR-22/23).** Réagir/lire ne notifie **personne** (bruit). Seule option
ouverte : prévenir le **coach** qu'une annonce dépasse un seuil de réactions — **différé**, hors
Palier 1.

### Palier 2 — Réactions **nominatives** + kudos de participation (déclenche l'AIPD)

Lève le voile d'anonymat — **bundlé avec la revue AIPD** (TLX-150), jamais avant.

1. **Pile d'avatars** sur les réactions (« ❤️ par Léa, Karim +6 ») : c'est exactement ce qu'ADR-43 §5
   a différé à l'AIPD. Mécanique = on autorise l'API à ressortir les **auteurs** des `*_reactions`
   (identité minimisée `GroupTeammate`, ADR-37 — nom + avatar, rien d'autre).
2. **Kudos de participation entre coéquipiers** : un 👏 sur la **présence confirmée** d'un coéquipier
   (« Karim a confirmé jeudi » → tu l'encourages), notifié au destinataire (nouveau type
   `group_kudos`, gate `groupUpdates`, ADR-22/23).
   - **Invariant dur :** le kudos porte sur la **participation** (axe présence ADR-43), **jamais sur
     la performance, la charge ou un record** — ces données restent **consent-gated et coach-scopées**
     (ADR-08/21). On encourage le *fait de venir*, pas le *résultat*. Aucun chiffre de perf ne fuit
     vers un pair.

**Préalable de conformité (bloquant).** Mise à jour TX-DPIA-007 (nouveau flux : réactions/kudos
nominatifs entre utilisateurs) + notice de confidentialité, **avant mise en production** (cohérent
ADR-37 §4 / ADR-43 §5). Repli si l'AIPD bloque : on **reste au Palier 1** (tout agrégé).

### Palier 3 — Fil de discussion bidirectionnel (rouvre ADR-46, le gros morceau)

ADR-46 a **explicitement écarté** le chat de groupe du MVP (modération, charge, RGPD pair-à-pair).
Le rouvrir suppose, **avant toute ligne de code**, de cadrer :

1. **Objet & scope** : réponses **sous une annonce** (fil court, lié à `group_announcements`) **ou**
   commentaires **sous une séance de groupe** (réutilise la grammaire `comments` déjà scopée séance,
   FeedbackThread TLX-118). À trancher dans l'ADR d'exécution.
2. **Modération (non négociable)** : signalement, blocage, suppression par le coach (propriétaire
   éditorial du groupe) **et** par l'auteur, anti-abus/rate-limit. C'est **ce coût** — pas la
   technique — qui place ce palier en dernier.
3. **RGPD** : contenu rédigé par des pairs (≠ annonce rédigée par le coach) → responsabilité,
   conservation, purge à l'effacement de compte (ADR-15) à spécifier.

### Invariants transverses (tous paliers)

- **Patron d'agrégat par défaut** (ADR-45) : tant que l'AIPD n'a pas tranché, **toute** remontée
  sociale est un **entier**, jamais une identité.
- **Frontière santé/perf** (ADR-08/21) : aucune interaction n'expose à un pair une performance, une
  charge ou un record. Le social porte sur **annonces** et **participation**, points.
- **Réutilisation infra** : annonces (ADR-46), agrégats (ADR-45), notifications (ADR-22/23), identité
  minimisée (ADR-37) — pas de nouvelle pile.
- **Zéro valeur en dur** : emoji bornés par enum serveur ; libellés/couleurs/badges via tokens DS ;
  délais via `.env`.
- **Un ADR d'exécution par palier** : celui-ci ne livre pas — il fixe la trajectoire et les gardes.

**Conséquences.**

- **Positives :** transforme un hub passif en **pouls d'équipe** ; le **Palier 1 est livrable
  immédiatement** (fort effet « waouh », réutilisation massive, **aucun blocage conformité**) ; la
  trajectoire rend l'AIPD (TLX-150) **utile et bornée** au lieu de bloquante ; la frontière santé/perf
  reste intacte ; chaque marche est défendable seule et réversible (repli au palier inférieur).
- **Négatives / coûts :** 2 tables légères au Palier 1 (`announcement_reactions`,
  `announcement_reads`) + extensions additives de `GroupAnnouncement` ; les Paliers 2-3 sont
  **gatés par l'AIPD / la modération** (dépendance hors-code assumée) ; risque de bruit de
  notifications à surveiller (réactions silencieuses par défaut).

**Alternatives considérées.**

- **Chat de groupe direct (un bloc).** Écarté : contourne ADR-37 §4 / ADR-43 §5 (AIPD non validée) et
  l'exclusion explicite d'ADR-46 ; impose modération d'emblée. Le gradient livre de la valeur **avant**
  de payer ce coût.
- **Réactions nominatives dès le départ.** Écarté : déclenche l'AIPD pour un gain que la version
  **agrégée** capture déjà à 80 % (le délice « ❤️ 8 » sans le risque « qui »).
- **Classement individuel / leaderboard de perf.** Écarté : compare des données de performance entre
  pairs → santé, consent-gated, coach-scopée (ADR-08/21). Le pouls reste **collectif et anonyme**.
- **Réutiliser `comments` pour les réactions d'annonce.** Écarté au Palier 1 : `comments` est scopé
  séance et porte du texte libre (modération) ; une table de réactions bornées est plus sûre et sans
  modération. (`comments` redevient candidat au **Palier 3**, fil de séance.)
- **Statu quo (hub descendant, ADR-44/46).** Reste le **repli** permanent si la conformité bloque les
  paliers nominatifs — le Palier 1 ne dépend pas d'eux.
