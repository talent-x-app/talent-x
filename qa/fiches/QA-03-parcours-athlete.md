# QA-03 — Parcours athlète : rejoindre → s'entraîner → progresser

Le parcours complet d'un athlète réel. Compte : `+qa-athlete` (QA-01.1), sur appareil.
Dépend du groupe et des séances du coach (QA-02).

## QA-03.1 — Premier lancement connecté

**Couvre** : `getMe`, accueil athlète (TLX-148).
**Attendu** : accueil avec carte « Rejoins ton coach » (aucun groupe), pas d'écran
d'erreur ; zone sûre haute respectée (barre système, `0acb8aa`).

## QA-03.2 — Rejoindre le groupe : code et QR

**Couvre** : `joinGroup`, `getMyGroups` + scan QR (TLX-188).
**Étapes** : saisir un code invalide ; rejoindre par **scan du QR** affiché sur
l'appareil coach (permission caméra demandée à ce moment-là, pas avant) ; vérifier
l'accueil.
**Attendu** : code invalide → erreur claire, pas de crash ; scan → préremplissage +
adhésion confirmée ; la carte « Rejoins ton coach » disparaît ; le coach reçoit
`group_update` (validé sur son appareil en QA-05.3).
**Preuve** : `select athlete_id, is_active from group_members where group_id = '<id>'`.

## QA-03.3 — Séances : liste ⇄ calendrier

**Couvre** : `listAssignments` (ADR-44 : onglet unifié).
**Étapes** : basculer Liste ⇄ Calendrier ; vue mois ⇄ semaine (ADR-47) ; sélectionner
un jour ; vérifier les pastilles de discipline (dérivées ADR-43 §2).
**Attendu** : les affectations de QA-02.4 sont là, avec tag de discipline « Sprint » ou
« Sauts » dérivé des blocs ; la compétition de QA-02.7 apparaît au calendrier.

## QA-03.4 — Détail de séance et présence (RSVP)

**Couvre** : `getAssignment`, `setAttendance`, `getAttendanceSummary`.
**Étapes** : ouvrir le détail (hero : discipline, échéance « dans N j », bandeau
adaptatif TLX-219/220) ; déclarer **Présent** ; passer à **Absent** → un motif est
exigé ; revenir à **Peut-être** ; regarder l'agrégat de présence.
**Attendu** : Absent sans motif → blocage 422 (`ATTENDANCE_REASON_REQUIRED`) ; la
présence n'écrit **jamais** le statut d'exécution (orthogonalité ADR-43/31) ; l'agrégat
« X présents · Y sans réponse » est **sans noms** (ADR-45) et se rafraîchit après
déclaration ; masqué si seul dans le groupe (`total ≤ 1`).
**Preuve** : `select attendance, attendance_reason, status from assignments where id =
'<id>'` → `maybe / null / assigned`.

## QA-03.5 — Saisir, puis corriger sa performance

**Couvre** : `submitPerformance`, `getPerformance`, `updatePerformance`,
`updateAssignment`. **⚠️ défaut connu TLX-223 sur les sauts.**
**Étapes** : depuis le détail, « Saisir ma perf » : renseigner les efforts guidés par
les blocs (temps par répétition pour le sprint, barres pour les sauts), RPE, notes ;
valider ; rouvrir → « Modifier ma perf » : corriger une valeur ; côté coach, vérifier la
version corrigée (historisation TLX-110).
**Attendu** : le CTA passe de « Saisir » à « Modifier » ; la correction est visible
coach ; **TLX-223 attendu : la saisie sauts impose 5 barres / 3 essais quelle que soit
la config coach** — confirmer que le défaut est toujours là et le pointer au rapport
(s'il a disparu, le dire aussi).
**Preuve** : `select rpe, submitted_at from performances where assignment_id = '<id>'` ;
notification `performance_submitted` chez le coach.

## QA-03.6 — Progression

**Couvre** : `getMyProgress` (ADR-21) — graphes `progress-charts` (37 tests unitaires,
mais le rendu SVG réel ne se voit que sur appareil).
**Étapes** : ouvrir Progression après plusieurs perfs ; changer d'épreuve ; vérifier la
carte « Ta progression » de l'accueil (dernier record, complétion du mois).
**Attendu** : graphes lisibles (thème clair **et** sombre), pas de tracé vide avec des
données présentes ; complétion du mois cohérente avec les séances réalisées/échues.

## QA-03.7 — Records : détection, confirmation, manuel

**Couvre** : `listMyRecords`, `confirmRecord`, `createManualRecord`.
**Étapes** : réaliser une perf meilleure que le record courant → bandeau de détection →
**confirmer** ; ajouter un record **manuel** (épreuve, marque, date passée) ; vérifier
la meilleure marque par saison (tlx-131).
**Attendu** : le record confirmé nourrit les **cibles individualisées** (« ≈ 7.71 s »
vue athlète / « 95 % record » vue coach — TLX-161) ; le manuel apparaît distinctement.
**Preuve** : `select event_key, value, source from records where athlete_id = '<id>'`.

## QA-03.8 — Séance libre (journal d'entraînement)

**Couvre** : `logTrainingSession` (ADR-36/38).
**Étapes** : consigner une séance libre simple ; une seconde en **multi-séries**
(Stepper 2-12, une marque par série) ; vérifier qu'elles nourrissent progression et
records ; **vérifier côté coach qu'il ne les voit nulle part** (recoupe QA-02.6).
**Preuve** : `select self_logged from sessions where ...` ; absence côté coach.

## QA-03.9 — Profil : identité, avatar, préférences

**Couvre** : `updateMe`, `createAvatarUpload`, `confirmAvatar`, `deleteAvatar`.
**Étapes** : modifier bio/discipline ; **changer la photo** (galerie) — l'upload passe
par le stockage objet ; supprimer la photo depuis le mode édition.
**Attendu** : photo visible sur son propre profil après confirmation ; suppression propre
(retour aux initiales).
⚠️ **Ne pas attendre l'avatar côté coach** : `GroupMember.athlete` porte un `UserSummary`
(id, prénom, nom, discipline) **sans `photoUrl`**, et les écrans coach rendent des
initiales. Seule la vue **pair-à-pair** `GroupTeammate` porte un `avatarUrl` (ADR-37).
L'asymétrie est dans le contrat : un athlète voit la photo de ses coéquipiers, son coach
ne la voit jamais. À arbitrer un jour, ce n'est pas un défaut.
**Preuve** : l'objet existe côté MinIO (`mc ls` ou URL de l'avatar) puis disparaît.
⚠️ Même mécanique présignée que les exports : la validation **contre OVH réel** est
portée par QA-06.4.

## QA-03.10 — Quitter le groupe

**Couvre** : `leaveGroup`.
**Étapes** : quitter (confirmation inline ADR-44 §6) ; constater l'accueil ; re-rejoindre
par code pour la suite de la campagne.
**Attendu** : hub inaccessible, séances du coach conservées en historique
(comportement à noter au rapport) ; la re-adhésion refonctionne — **consentement
`coach_access` re-scopé** (recoupe QA-06.2).
