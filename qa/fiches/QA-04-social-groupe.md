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
resource_id = '<groupId>'` → = nombre de membres − 1.

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
**Étapes** : l'athlète 2 envoie des kudos sur l'affectation réalisée par B ; B reçoit
`group_kudos` (bannière « Un coéquipier t'encourage 👏 », **sans nom** — générique
ADR-10) ; l'athlète 2 retire puis renvoie.
**Attendu** : idempotence du retrait/renvoi ; pas de kudos sur sa propre affectation
(sonde → refus).
**Preuve** : `select count(*) from assignment_kudos where assignment_id = '<id>'`.

## QA-04.7 — Discussion de séance

**Couvre** : `createComment` (cible session), `listComments`, `deleteComment`.
**Étapes** : B commente la **séance** (fil de séance, tlx-129) ; le coach répond ; B
supprime son propre commentaire ; sonde : B tente de supprimer celui du coach.
**Attendu** : fil visible des deux côtés ; suppression d'autrui refusée.
