# QA-02 — Parcours coach : groupe → séances → suivi → compétitions

Le parcours complet d'un coach réel, du premier lancement au suivi d'athlètes.
Compte : `+qa-coach` (créé en QA-01.1), **sur appareil** (le coach sur téléphone est le
chaînon jamais testé — cf. QA-05.3). Les athlètes de QA-03 rejoignent ce groupe.

## QA-02.1 — Créer son groupe et inviter

**Couvre** : `createGroup`, `listGroups`, `listGroupMembers`, `manageInviteCode`.
**Étapes** : créer un groupe (nom, description) ; afficher le code d'invitation et le QR ;
**régénérer** le code ; vérifier que l'ancien code est refusé à l'adhésion (tester avec
l'athlète QA-03.2) ; consulter la liste des membres après adhésion.
**Attendu** : QR affiché et scannable ; l'ancien code → erreur explicite côté athlète ;
le roster montre nom + avatar, **rien de plus** (minimisation ADR-37).
**Preuve** : adhésion refusée sur l'ancien code, acceptée sur le nouveau ;
`select count(*) from group_members where group_id = '<id>'`.

## QA-02.2 — Construire une séance complète (ADR-39)

**Couvre** : `createSession`, `listSessions`, `getSession`.
**Étapes** : construire une séance avec le canevas à cartes : échauffement ; carte
**Sprint** (répétitions, distance, récup r/R, **bascule passive/active** TLX-224,
intensité en % record) ; carte **Sauts** via l'assistant, modèle « Hauteur » (éditeur
vertical, barres montantes) ; carte **Endurance** ; retour au calme. Enregistrer en
**brouillon**, relire, puis **publier**.
**Attendu** : la relecture affiche exactement ce qui a été saisi (le sérialisé ne ment
pas — invariant ADR-39) ; un brouillon n'est pas assignable, une publiée l'est.
**Preuve** : relecture du détail après fermeture/réouverture de l'app (pas seulement
l'état en mémoire).

## QA-02.3 — Cycle de vie d'une séance

**Couvre** : `updateSession`, `duplicateSession`, `archiveSession`, `deleteSession`.
**Étapes** : modifier la séance publiée (titre, un paramètre d'effort) ; la dupliquer ;
archiver la copie ; supprimer un brouillon ; tenter de supprimer une séance **déjà
affectée**.
**Attendu** : la modification est visible côté athlète déjà affecté ; l'archivée sort
des listes actives ; la suppression d'une séance affectée est refusée ou retire
proprement les affectations (noter le comportement au rapport — il fait foi).
**Preuve** : listes avant/après ; côté athlète, l'affectation reflète l'état.

## QA-02.4 — Affecter : individuel, groupe, désaffectation

**Couvre** : `assignSession`, `unassignSessionGroup`, `deleteAssignment`.
**Étapes** : affecter à **un** athlète (échéance J+1) ; affecter au **groupe** entier ;
désaffecter le groupe ; supprimer une affectation individuelle.
**Attendu** : chaque athlète actif du groupe reçoit **une** affectation (fan-out
ADR-30) ; la désaffectation de groupe ne touche pas l'affectation individuelle ; les
push `session_assigned` partent (QA-05.2 les valide côté athlète).
**Preuve** : `select count(*) from assignments where session_id = '<id>'` avant/après ;
notifications en base pour chaque membre.

## QA-02.5 — Suivre et commenter les performances

**Couvre** : `createComment` (cible performance), notification `performance_submitted`.
**Départ** : l'athlète QA-03 a saisi une perf (QA-03.5).
**Étapes** : recevoir la notification de perf soumise (**sur l'appareil coach** —
première fois) ; ouvrir la perf depuis la notification ; poster un feedback.
**Attendu** : le tap ouvre le bon écran ; l'athlète reçoit `performance_feedback`
(QA-05.2) ; le fil de discussion montre les deux côtés (ADR-23 / A-09).
**Preuve** : `select type, actor_id from notifications where user_id = '<coach>' order
by created_at desc limit 3`.

## QA-02.6 — Dashboard et statistiques d'athlète

**Couvre** : `getCoachDashboard`, `getAthleteStats`, `getAthleteProgress`,
`listAthleteRecords`.
**Étapes** : ouvrir le dashboard (KPIs de complétion, athlètes en retard) ; ouvrir la
fiche d'un athlète : stats, progression, records.
**Attendu** : les chiffres recoupent la réalité créée pendant la campagne (n séances
affectées, m réalisées) ; **cloisonnement ADR-51 §D3 : les séances libres de l'athlète
(QA-03.8) n'apparaissent nulle part côté coach**.
**Preuve** : recoupement manuel des compteurs ; absence de la séance libre de QA-03.8
dans la progression vue coach.

## QA-02.7 — Compétitions

**Couvre** : `createCompetition`, `listCompetitions`, `getCompetition`,
`updateCompetition`, `deleteCompetition`, `engageAthletes`, `listEntries`,
`unengageAthlete`. (Parcours déjà vert en E2E web — tlx-85 ; ici : sur appareil.)
**Étapes** : créer une compétition (lieu, date future) ; engager 2 athlètes sur une
épreuve ; confirmer ; désengager un athlète ; modifier la compétition ; côté athlète :
la voir au calendrier ; supprimer la compétition.
**Attendu** : l'engagement apparaît côté athlète (calendrier, ADR-24) ; la suppression
retire les entrées proprement.
**Preuve** : calendrier athlète avant/après ; `select count(*) from competition_entries
where competition_id = '<id>'`.

## QA-02.8 — Administrer le groupe, contrôles d'accès

**Couvre** : `getGroup`, `updateGroup`, `removeGroupMember`, `deleteGroup` + sondes RBAC.
**Étapes** : renommer le groupe ; retirer un membre ; **sondes d'étanchéité** (véhicule
de diagnostic, jeton du coach B créé pour l'occasion) : `GET /groups/{id}` d'un groupe
étranger, `PUT /assignments/{id}/attendance` en tant que coach ; enfin supprimer un
groupe de test vide.
**Attendu** : renommage visible côté athlètes ; le membre retiré perd l'accès au hub ;
sondes → **404 anti-énumération** (groupe étranger) et **403** (attendance côté coach) —
conformes à la matrice de droits (spec §6).
**Preuve** : les codes HTTP des sondes ; l'écran du membre retiré.
