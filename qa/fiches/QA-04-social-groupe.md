# QA-04 — Social de groupe : annonces, réponses, réactions, kudos, pulse

La vie d'équipe (ADR-46 → 50). Trois participants : coach (appareil A), athlète
(appareil B), **second athlète** (`+qa-athlete2`, web ou 3ᵉ appareil) — le fan-out et
les vues croisées exigent d'être trois. Largement couvert en E2E web (tlx-184/185/186) :
ici, on vérifie **sur appareil** et **le fan-out réel multi-comptes**.

## QA-04.1 — Annonce du coach : fan-out, lecture, pouls

**Couvre** : `createAnnouncement`, `listAnnouncements`, `deleteAnnouncement`,
`markAnnouncementRead`.
**Étapes** : le coach publie une annonce (≤1000 car., et tester la limite : 1001 → 422) ; les deux athlètes la voient dans l'onglet Annonces ; l'athlète B l'ouvre
(marquage lu) ; le coach supprime une annonce de test.
**Attendu** : chaque membre actif **sauf l'auteur** est notifié (`group_announcement`,
push validé en QA-05) ; le pouls de lecture évolue côté coach ; la suppression est un
soft-delete (l'annonce disparaît des listes).
**Preuve** : `select count(*) from notifications where type = 'group_announcement' and
resource_id = '<groupId>'` → **= nombre de membres actifs** quand l'auteur est le **coach**
(il n'est pas membre du groupe), **= membres − 1** si l'auteur est lui-même membre.
Vérifié le 21/08 : 2 membres, coach auteur → **2 notifications par annonce**, aucune au coach.

## QA-04.2 — Réactions

**Couvre** : `addAnnouncementReaction`, `removeAnnouncementReaction`.
**Étapes** : B réagit à l'annonce ; retire sa réaction ; re-réagit.
**Attendu** : compteur juste sur les trois vues (coach, B, athlète 2) après
rafraîchissement ; pas de double comptage au re-tap.

## QA-04.3 — Réponses sous une annonce, signalement

**Couvre** : `listAnnouncementReplies`, `createAnnouncementReply`,
`deleteAnnouncementReply`, `reportAnnouncementReply`.
**Étapes** : B répond ; le coach voit le compteur `replyCount` bouger (ADR-48/50) et
reçoit `group_reply` ; l'athlète 2 **signale** la réponse ; B supprime sa réponse ;
sonde : B tente de supprimer la réponse d'autrui.
**Attendu** : fil chronologique correct ; signalement accepté (tracé côté base) ;
suppression d'autrui → 403/404.
**Preuve** : `select count(*) from announcement_reply_reports` avant/après ; code HTTP
de la sonde.

## QA-04.4 — Pouls d'équipe

**Couvre** : `getTeamPulse`.
**Étapes** : ouvrir le mur/pouls côté coach après les actions ci-dessus.
**Attendu** : les agrégats reflètent lectures/réactions/réponses de la campagne —
recoupement manuel avec ce qui vient d'être fait.

## QA-04.5 — Coéquipiers et présence des coéquipiers

**Couvre** : `getGroupTeammates`, `getTeammatesAttendance`.
**Étapes** : B ouvre l'onglet Coéquipiers (carte « Ton coach », compteur excluant B
lui-même, « Membre depuis le … ») ; sur une séance commune où l'athlète 2 a déclaré sa
présence, B consulte la présence des coéquipiers.
**Attendu** : roster minimisé (nom + avatar, ADR-37) ; la présence des coéquipiers
respecte le périmètre livré (agrégat/affichage conforme ADR-45 — pas de motif d'absence
d'autrui exposé).
**Preuve** : réponse `getTeammatesAttendance` (véhicule de diagnostic) — champs exposés
à recopier au rapport.

## QA-04.6 — Kudos

**Couvre** : `giveKudos`, `removeKudos`.
**Étapes** : l'athlète 2 envoie des kudos sur l'affectation de B ; B reçoit `group_kudos` ;
l'athlète 2 retire puis renvoie.
**Attendu** : bannière push **générique** — titre « Un coéquipier t'encourage », corps
« Quelqu'un de ton groupe t'a envoyé des encouragements 👏. », **sans nom** (ADR-10) —
alors que l'entrée in-app **nomme l'acteur** : « Alex t'envoie des encouragements 👏. »
(ADR-55). Le push ne transporte que `{ type, resourceId }` : aucun nom n'y circule.
Idempotence du retrait/renvoi ; pas de kudos sur sa propre affectation (sonde → refus).
**Preuve** : `select count(*) from participation_kudos where assignment_id = '<id>'` ;
code HTTP de la sonde (**422 `KUDOS_SELF_FORBIDDEN`**, pas un 403).

⚠️ **La garde du kudos porte sur `attendance`, pas sur `status`** : une affectation encore
`assigned` est encourageable dès lors que la présence est `going` (`kudos.service.ts`).
Ne pas exiger une séance réalisée pour dérouler le scénario.

⚠️ **Sens du test, et il est contre-intuitif.** Le jeton push suit le dernier `signIn` et
l'appareil n'en détient qu'un : **c'est le porteur de l'appareil qui doit recevoir**, donc
le donneur est piloté par script. Basculer de compte pour « se mettre côté receveur »
déplace le jeton et détruit le témoin. Le 21/08, le kudos de 12:16:08 partait de l'appareil
vers un compte sans jeton : il n'a produit aucune bannière, et ne prouvait rien.
Script : `kudos-recu.mjs` (`give` / `remove` / `status`).

## QA-04.7 — Discussion de séance

**Couvre** : `createComment` (cible session), `listComments`, `deleteComment`.
**Étapes** : B commente la **séance** (section « Discussion », TLX-118 — pas le fil de perf
d'A-09) ; le coach répond (script `fil-seance.mjs reply`) ; sondes de suppression **par
script**.
**Attendu** : fil visible des deux côtés ; suppression d'autrui → **403** (« Vous ne pouvez
supprimer que vos propres commentaires. »), du sien → **204**, suppression **douce**
(`deleted_at`). **Aucune notification n'est émise, dans aucun des deux sens** — mesuré le
21/08, c'est le défaut TLX-268, pas un ratage de sonde.

⚠️ **`deleteComment` n'a aucun appelant mobile** (TLX-256) : « B supprime son propre
commentaire » **n'est pas exécutable sur appareil**. Sonder par script uniquement.

⚠️ **Ne pas soumettre de performance sur la séance testée.** Côté athlète la « Discussion »
n'est montée que **tant qu'aucune perf n'existe** (`SessionDetailScreen.tsx:589-603`) ;
dès la soumission elle cède la place au fil de feedback et le scénario devient injouable.
Le coach, lui, garde le fil en permanence.

⚠️ **L'écran de détail n'a pas de tirer-pour-rafraîchir** (TLX-269). Pour voir la réponse
du coach : sortir vers une autre séance et revenir — et **seulement après 30 s**
(`staleTime`). Plus tôt, l'aller-retour ne ramène rien et on conclut à tort que la réponse
s'est perdue.
