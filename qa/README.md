# Plan de qualification — Talent-X MVP

Campagne de qualification du MVP sur le **staging**, préalable à toute mise en production
(TX-OPS-004 §2). Ce plan couvre **l'intégralité des parcours métier** — la matrice de
l'annexe A trace chaque opération du contrat vers son scénario.

## 1. Ce que la qualification doit prouver — et ce qu'elle ne refait pas

L'automatisation existante fait foi pour ce qu'elle couvre : **1056 tests mobile**
(114 suites), tests API unitaires + **intégration DB-backed**, **21 specs Playwright**
(`apps/mobile/e2e/`, cible Expo web). La qualification ne les rejoue pas à la main.

Elle prouve ce que l'automatisation **ne peut pas** prouver :

1. **Le comportement sur appareil réel** — trois défauts réels trouvés en 2 jours
   (`setNotificationHandler` absent, idempotence d'enregistrement non scopée TLX-226,
   cloche figée TLX-231) étaient tous invisibles en Jest comme en Playwright web.
2. **La configuration du staging** — les écarts local/staging (credentials absents,
   variables non lues, `restart` vs `up -d`) ne se voient que contre le vrai serveur.
3. **Les chemins RGPD de bout en bout** — export livré par URL présignée contre le
   **vrai** stockage objet, purge de compte, consentements par coach.
4. **Les artefacts de build** — un build `preview` autonome, pas le dev client.

## 2. Principes (non négociables)

- **Chaque scénario nomme sa preuve** : la requête SQL, la ligne de log ou le code HTTP
  qui tranche — jamais un « ça marche » à l'œil. Les preuves types sont en §5.
- **Vérifié ≠ supposé.** Un rapport distingue ce qui a été mesuré de ce qui est déduit.
  (Précédent : les guillemets de `staging.env`, crainte plausible, levée par la mesure.)
- **Adresses email réelles uniquement.** Le test du 18/08 a produit un `hardBounce`
  Brevo sur une adresse générée : les rebonds durs détruisent la réputation d'expéditeur
  et font suspendre le compte. Toute adresse de compte QA est une boîte réelle
  (alias `+qa` d'une boîte contrôlée). **Aucune adresse inventée.**
- **Un rapport par campagne**, committé dans `qa/rapports/` (`AAAA-MM-JJ-<portée>.md`,
  modèle : `rapports/TEMPLATE.md`). Tout défaut ouvre un ticket TLX et rejoint le
  registre §7.
- **Qualifier n'est pas corriger.** Une session de campagne **ne produit aucun
  correctif** : corriger en cours de route change la chose mesurée et invalide ce qui
  précède. Les défauts partent en tickets, les correctifs se font ailleurs (§8).

## 3. Environnement et véhicule de test

| Élément                | Valeur                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| API staging            | `https://staging-api.talent-x.app/api/v1` (health public)                                        |
| Stockage objet         | `https://staging-storage.talent-x.app` (MinIO — ⚠️ diverge d'OVH, cf. QA-06)                     |
| Accès serveur          | `ssh talentx-staging` → `/opt/talentx/staging`, secrets `/etc/talentx/staging.env` (root:600)    |
| Véhicule nominal       | **Build `preview`** (URL staging figée au build, `45a4945`) — le plus proche de l'artefact store |
| Véhicule de diagnostic | Dev client + Metro (`.env` local sur staging) — logs `console` visibles                          |
| Appareils              | Android S20 FE ; iPhone (profil AdHoc, 1 UDID, valide → 2027-01-08)                              |

⚠️ **Les builds `distribution: internal` expirent** (précédent : `518ebf13` → 2026-08-25).
Vérifier la date avant campagne ; rebuilder **depuis `apps/mobile`**, jamais la racine.

## 4. Fiches de parcours

| Fiche                                       | Parcours                                                | Prérequis d'enchaînement |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------ |
| [QA-01](fiches/QA-01-auth.md)               | Compte : inscription, session, récupération             | aucun                    |
| [QA-02](fiches/QA-02-parcours-coach.md)     | Coach : groupe → séances → suivi → compétitions         | QA-01                    |
| [QA-03](fiches/QA-03-parcours-athlete.md)   | Athlète : rejoindre → s'entraîner → progresser          | QA-02.1 (groupe + code)  |
| [QA-04](fiches/QA-04-social-groupe.md)      | Social : annonces, réponses, réactions, kudos, pulse    | QA-02 + QA-03            |
| [QA-05](fiches/QA-05-notifications-push.md) | Notifications : push, tap, préférences, cycle device    | QA-03                    |
| [QA-06](fiches/QA-06-rgpd.md)               | RGPD : consentements, export, suppression, minimisation | QA-03                    |
| [QA-07](fiches/QA-07-hors-ligne.md)         | Hors ligne : saisie, idempotence, reprise               | QA-03                    |
| [QA-08](fiches/QA-08-ops-builds.md)         | Ops & builds : préflight, artefacts, permissions        | aucun                    |

Ordre de campagne recommandé : **QA-08.1 (préflight) → 01 → 02 → 03 → 05 → 04 → 06 → 07 → 08 (reste)**.
Les scénarios sont écrits pour s'enchaîner : les comptes et données créés en amont resservent.

## 5. Preuves types (copier-coller)

```bash
# SQL sur le staging
ssh talentx-staging 'cd /opt/talentx/staging && sudo docker compose \
  --env-file /etc/talentx/staging.env exec -T postgres psql -U talentx -d talentx -c "<SQL>"'

# Logs du worker (rejets notifications, envois email) / de l'API (événements métier)
ssh talentx-staging 'cd /opt/talentx/staging && sudo docker compose \
  --env-file /etc/talentx/staging.env logs worker --since 10m'
```

Pièges de lecture — coûtent une matinée chacun, déjà payés :

- **Le silence du worker est un succès.** `NotificationProcessor` ne journalise que les
  rejets ; tous les chemins d'échec de `fcm-client.ts` écrivent un `warn`. Zéro ligne
  = envoi accepté.
- **L'API ne journalise pas les requêtes** (démarrage + événements métier seulement).
  L'absence de trace ne prouve pas l'absence d'appel — la base fait foi.
- **`docker compose restart` ne relit pas `env_file`** — seul `up -d` recrée le
  conteneur avec le nouvel environnement.
- **L'enregistrement push n'a lieu qu'au passage par `signIn`** : après bascule
  d'environnement ou de compte, déconnexion/reconnexion obligatoire (TLX-226).

## 6. Critères d'entrée et de sortie

**Entrée** : CI verte sur le `main` déployé · santé staging (QA-08.1 intégralement vert) ·
build `preview` frais installé · comptes QA à boîtes réelles créés.

**Sortie** : 100 % des scénarios déroulés et tracés · **zéro défaut bloquant ou majeur
ouvert** (bloquant = perte de données, faille d'accès, parcours cœur impraticable ;
majeur = contournement pénible sans perte) · tout défaut mineur a son ticket TLX ·
rapport committé.

## 7. Registre des défauts et écarts connus (avant campagne)

À confirmer ou clore pendant la campagne — **ne pas les redécouvrir** :

| Réf     | Constat                                                                                                                                                                                                             | Où c'est traité                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| TLX-231 | ~~La cloche ne se rafraîchit pas à l'arrivée d'un push~~ — **résolu**, vérifié sur appareil le 19/08                                                                                                                | QA-05.4                         |
| TLX-235 | À l'arrivée d'un push, la ressource n'est pas invalidée — **3 cas sur 4 résolus le 19/08** ; la 4ᵉ clé est corrigée et fusionnée le 19/08, **à rejouer**                                                            | QA-05.4                         |
| TLX-236 | ~~Le mode saisie persiste entre séances → feedback du coach illisible~~ — **résolu**, rejoué sur appareil le 19/08                                                                                                  | QA-05.2                         |
| TLX-237 | ~~Un push reçu app en arrière-plan n'apparaît jamais dans le centre~~ — **résolu**, rejoué sur appareil le 19/08                                                                                                    | QA-05.6                         |
| TLX-239 | États locaux rémanents sur les écrans d'onglet masqués — **ADR-58 accepté et appliqué le 20/08** (`key` de route sur 13 routes, test de découverte), **à rejouer**                                                  | QA-02/QA-03                     |
| TLX-240 | ~~Clé d'affectation au singulier/pluriel ; préchauffage de cache annulé par une invalidation~~ — **fermé le 19/08** : le point 2 était faux, mesuré sur le client réel                                              | hors campagne — clos            |
| TLX-241 | La suite mobile ne se termine pas proprement (« worker failed to exit gracefully »)                                                                                                                                 | hors campagne — dette de test   |
| TLX-223 | Sauts : « Nb de barres » / « Essais par barre » du coach ignorés par la saisie athlète — **confirmé sur appareil le 19/08** ; arbitré le 20/08 : **la saisie doit lire le réglage**                                 | QA-03.5                         |
| TLX-238 | ~~**BLOQUANT.** Crash du coach à l'enregistrement d'une séance : deux formes incompatibles sous la clé `['groups']`~~ — **corrigé et fusionné le 19/08**, `queryFn` rapatriée dans `groups-query.ts`, **à rejouer** | QA-02.2                         |
| TLX-254 | **CI rouge depuis le 19/08** (fusion du lot 3) : couverture de branches 79,86 % pour un seuil à 80 % — 8 branches manquantes                                                                                        | hors campagne — bloque le CI    |
| TLX-84  | ~~`group_update` jamais validé sur appareil~~ — **résolu le 19/08** ; reste la documentation du transfert hors UE                                                                                                   | QA-05.3                         |
| —       | Contenu de l'email de reset jamais vu ; **le lien pointe sur `APP_PUBLIC_URL` = hôte API, qui ne sert aucune app**                                                                                                  | QA-01.5                         |
| —       | URL présignées jamais validées contre le vrai OVH Object Storage (MinIO en staging)                                                                                                                                 | QA-06.4                         |
| —       | 2FA = V2, `501` assumé au contrat                                                                                                                                                                                   | QA-01.8 (test négatif)          |
| —       | `android.permission.RECORD_AUDIO` ajoutée par `expo-camera` (l'app ne fait que scanner des QR)                                                                                                                      | QA-08.5                         |
| —       | Favicon web jamais vérifié (`expo export -p web`)                                                                                                                                                                   | QA-08.6                         |
| —       | Monogramme in-app à 74 % vs 60,5 % dans l'UI kit                                                                                                                                                                    | QA-08.6                         |
| —       | Image API 1,44 Go (poids de pull à chaque déploiement)                                                                                                                                                              | hors campagne — ops, avant prod |
| —       | Heads-up One UI : bannière OK constatée le 18/08 sur S20 FE ; si absente ailleurs, réglage « Afficher en pop-up », pas un défaut app                                                                                | QA-05.2                         |
| —       | Compte Brevo plan gratuit (300 crédits) — suffisant pour qualifier, pas pour ouvrir                                                                                                                                 | QA-08.1                         |

## 8. Traitement des défauts — la campagne ne corrige rien

Séparation stricte, pour deux raisons : un correctif appliqué en pleine campagne
invalide les scénarios déjà déroulés (l'artefact testé n'est plus le même), et
l'attention qu'exige un diagnostic n'est pas celle qu'exige une implémentation.

**Ce que fait la session de campagne** — reproduire, prouver, ouvrir le ticket avec la
preuve, consigner au rapport, **continuer**. Rien d'autre.

**Ticket de campagne** — statut **Backlog**, jamais Todo (le flux de sprint reste celui
du produit), et label **`qa-campagne`**. La sévérité est portée par le rapport, la
priorité Linear par l'arbitrage. Un ticket ainsi marqué se lit : « défaut établi, preuve
jointe, correctif non commencé, arbitrage à faire ».

**Ce qui déclenche la correction** — un **lot** rédigé en fin de session dans
`qa/correctifs/AAAA-MM-JJ-lot-N.md` : le prompt à donner à une session de développement
distincte, avec les tickets, l'ordre, les contraintes et les pièges connus. La session
de campagne n'ouvre jamais ce chantier elle-même.

**Retour de boucle** — une fois le lot livré, la campagne **rejoue les scénarios
concernés** contre le staging redéployé, et le rapport suivant clôt les lignes du
registre §7. Un défaut n'est clos que par un scénario vert, pas par un commit.

## Annexe A — couverture du contrat (80 opérations)

Chaque opération d'`docs/talent-x-openapi.yaml` et le scénario qui l'exerce sur staging.
`[E2E:xxx]` = déjà couverte en continu par une spec Playwright (web) — le scénario manuel
la rejoue sur appareil seulement si la colonne l'indique.

| Opération                                                                                     | Scénario                                           | Automatisé                                |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| register                                                                                      | QA-01.1                                            | int                                       |
| login                                                                                         | QA-01.2                                            | int, E2E (toutes)                         |
| refresh                                                                                       | QA-01.3                                            | int                                       |
| logout                                                                                        | QA-01.6                                            | int                                       |
| logoutAll                                                                                     | QA-01.7                                            | int                                       |
| forgotPassword                                                                                | QA-01.4                                            | int                                       |
| resetPassword                                                                                 | QA-01.5                                            | int                                       |
| enable2fa / verify2fa                                                                         | QA-01.8 (501 attendu)                              | —                                         |
| getMe                                                                                         | QA-03.1                                            | E2E                                       |
| updateMe                                                                                      | QA-03.9                                            | E2E:tlx-134                               |
| deleteMe                                                                                      | QA-06.5                                            | E2E:tlx-194                               |
| createAvatarUpload / confirmAvatar / deleteAvatar                                             | QA-03.9                                            | E2E:tlx-134                               |
| getConsents / updateConsent                                                                   | QA-06.1 / QA-06.2                                  | int (ADR-51)                              |
| requestExport / getExport                                                                     | QA-06.4                                            | int                                       |
| createGroup / listGroups / listGroupMembers                                                   | QA-02.1                                            | E2E                                       |
| manageInviteCode                                                                              | QA-02.1                                            | E2E                                       |
| getMyGroups / joinGroup                                                                       | QA-03.2                                            | E2E:tlx-173                               |
| getGroup / updateGroup / deleteGroup                                                          | QA-02.8                                            | —                                         |
| removeGroupMember                                                                             | QA-02.8                                            | —                                         |
| leaveGroup                                                                                    | QA-03.10                                           | —                                         |
| getGroupTeammates                                                                             | QA-04.5                                            | E2E:tlx-173                               |
| listAnnouncements / createAnnouncement / deleteAnnouncement                                   | QA-04.1                                            | E2E:tlx-184                               |
| markAnnouncementRead                                                                          | QA-04.1                                            | E2E:tlx-185                               |
| addAnnouncementReaction / removeAnnouncementReaction                                          | QA-04.2                                            | E2E:tlx-185                               |
| listAnnouncementReplies / createAnnouncementReply / deleteAnnouncementReply                   | QA-04.3                                            | E2E:tlx-186                               |
| reportAnnouncementReply                                                                       | QA-04.3                                            | E2E:tlx-186                               |
| getTeamPulse                                                                                  | QA-04.4                                            | E2E:tlx-185                               |
| createSession / listSessions / getSession                                                     | QA-02.2                                            | E2E:tlx-166, tlx-209                      |
| updateSession / deleteSession                                                                 | QA-02.3                                            | E2E:tlx-194, coach-misc                   |
| duplicateSession                                                                              | QA-02.3 — **modèles seulement**, pas les séances   | aucun E2E (vérifié le 20/08)              |
| archiveSession                                                                                | QA-02.3 — **aucun client mobile** (TLX-256)        | aucun E2E possible : rien à piloter       |
| assignSession (individuel + groupe) / unassignSessionGroup                                    | QA-02.4                                            | E2E:tlx-133, tlx-198                      |
| createCompetition / listCompetitions / getCompetition / updateCompetition / deleteCompetition | QA-02.7                                            | E2E:tlx-85                                |
| engageAthletes / listEntries                                                                  | QA-02.7                                            | E2E:tlx-85                                |
| unengageAthlete                                                                               | QA-02.7 — **aucun client mobile** (TLX-256)        | aucun E2E possible : rien à piloter       |
| listAssignments                                                                               | QA-03.3                                            | E2E:tlx-173                               |
| getAssignment / updateAssignment                                                              | QA-03.4 / QA-03.5                                  | E2E:tlx-220                               |
| deleteAssignment                                                                              | QA-02.4                                            | —                                         |
| setAttendance / getAttendanceSummary                                                          | QA-03.4                                            | int (ADR-43/45)                           |
| getTeammatesAttendance                                                                        | QA-04.5                                            | int                                       |
| giveKudos / removeKudos                                                                       | QA-04.6                                            | E2E:tlx-185                               |
| submitPerformance                                                                             | QA-03.5 · QA-07.1 (idempotence)                    | int, E2E:tlx-220                          |
| getPerformance / updatePerformance                                                            | QA-03.5                                            | E2E:tlx-220                               |
| createComment / listComments / deleteComment                                                  | QA-02.5 · QA-04.7                                  | E2E:tlx-129                               |
| getMyProgress                                                                                 | QA-03.6                                            | E2E:tlx-131                               |
| listMyRecords / createManualRecord / confirmRecord                                            | QA-03.7                                            | E2E:tlx-131                               |
| logTrainingSession                                                                            | QA-03.8                                            | E2E:tlx-132                               |
| listAthleteRecords / getAthleteProgress / getAthleteStats                                     | QA-02.6                                            | E2E (cloisonnement : int ADR-51 §D3)      |
| getCoachDashboard                                                                             | QA-02.6                                            | E2E:tlx-130                               |
| listNotifications / readAllNotifications / readNotification                                   | QA-05.4                                            | E2E:tlx-221, tlx-140                      |
| registerDevice / revokeDevice                                                                 | QA-05.1 / QA-05.6                                  | unit (TLX-226) — **appareil réel requis** |
| getNotificationPreferences / updateNotificationPreferences                                    | QA-05.5                                            | int                                       |
| health / ready                                                                                | QA-08.1                                            | sonde déploiement                         |
| metrics (hors /api/v1)                                                                        | QA-08.2 — **401 sans jeton vérifié le 2026-08-18** | —                                         |
