__Talent\-X__

__Document 2 — Spécifications fonctionnelles et conception d'API__

*Fonctionnalités, règles métier, modèle d'autorisation et contrats d'échange REST — révision intégrant l'audit de conception\.*

__Référence__

TX\-SPEC\-002

__Version__

2\.0

__Date__

4 juin 2026

__Statut__

Spécification technique détaillée — révision 2\.0 \(corrections d'audit \+ améliorations\)

Ce document fait partie du lot documentaire Talent\-X\. Il décrit les fonctionnalités, les règles métier et les contrats d'API\. Il s'appuie sur le modèle d'autorisation et le modèle de données : pour la structure des données, TX\-DATA\-006 fait foi ; pour l'architecture et l'authentification, voir TX\-ARCH\-001\. La présente révision rend les contrats cohérents avec les fonctionnalités décrites et comble les lacunes de l'audit\.

# Historique des révisions

__Version__

__Date__

__Nature des modifications__

1\.0

8 avril 2026

Version initiale\.

2\.0

4 juin 2026

Matrice d'autorisation complète ; catalogue d'endpoints complété \(consentements, logout/logout\-all, gestion des effectifs, commentaires, notifications, archivage, opérations asynchrones\) ; relation performance↔affectation ; idempotence des écritures sensibles ; enveloppe de pagination ; en\-têtes de rate limiting ; rotation et détection de réutilisation des refresh tokens ; reset de mot de passe anti\-énumération ; cycle de vie séance/affectation aligné sur TX\-DATA\-006 ; clarification de « programme » \(V2\) ; nouvelles règles métier RB\-07 à RB\-11\.

__Sommaire__

# 1\. Périmètre fonctionnel

Talent\-X couvre le cycle de travail quotidien entre un coach et un athlète : planifier, attribuer, exécuter, mesurer, commenter et analyser\. Les fonctionnalités restent lisibles dans l'application mobile et simples à exposer via des ressources API stables\.

__Domaine__

__Objectif métier__

__Valeur utilisateur__

Compte

Créer et gérer l'identité numérique

Accès sécurisé, profil clair, préférences personnelles\.

Entraînement

Définir et diffuser les séances

Organisation structurée du travail sportif\.

Performance

Enregistrer les résultats

Historique exploitable et progression visible\.

Collaboration

Relier coach et athlète

Feedback contextualisé et meilleure adaptation des plans\.

Groupes

Structurer un effectif

Pilotage plus simple d'un collectif ou d'un club\.

RGPD

Donner le contrôle sur les données

Confiance, transparence et conformité\.

# 2\. Rôles applicatifs

__Rôle__

__Périmètre__

Coach

Crée des séances, gère des groupes, affecte des séances, consulte les résultats et suit des indicateurs\.

Athlète

Consulte ses séances, saisit ses performances, suit sa progression, rejoint un groupe et échange avec son coach\.

Système

Assure les notifications, la sécurité, les exports, les suppressions et les traitements planifiés\.

Les rôles sont simples au niveau IAM, mais les droits réels sont raffinés par trois notions supplémentaires : l'appartenance \(un coach ne voit que ses athlètes\), la propriété \(une ressource appartient à son créateur\) et le consentement \(l'accès du coach aux performances est conditionné\)\. Le détail figure en section 6\.

# 3\. Catalogue fonctionnel détaillé

## 3\.1 Gestion du compte et du profil

- Inscription par email et mot de passe avec choix du rôle lors de l'onboarding\.
- Connexion sécurisée et renouvellement de session \(rotation des jetons\), déconnexion sur un ou tous les appareils\.
- Réinitialisation de mot de passe par email, avec lien à usage unique et expirant\.
- Édition du profil : nom, prénom, photo, sport, biographie, préférences de notification\.
- Gestion explicite des consentements et accès aux fonctions d'export et d'effacement\.

## 3\.2 Fonctionnalités coach

- Créer, modifier, dupliquer, publier et archiver une séance\.
- Affecter une séance à un ou plusieurs athlètes liés\.
- Créer et administrer des groupes : inviter, lister les membres, retirer un athlète, régénérer le code, supprimer le groupe\.
- Suivre les performances individuelles et consulter un tableau de bord synthétique \(sous consentement des athlètes\)\.
- Laisser un feedback sur une séance réalisée ou une performance\.

__Note\. __La diffusion d'un « programme » \(collection ordonnée de séances\) est hors périmètre du MVP et prévue en V2 \(cf\. TX\-ARCH\-001, glossaire\)\. Au MVP, le coach affecte des séances individuelles\.

## 3\.3 Fonctionnalités athlète

- Consulter les séances à venir et l'historique\.
- Saisir des performances : temps, charges, répétitions, ressenti \(RPE\), notes libres — y compris hors ligne\.
- Corriger une performance de façon tracée\.
- Visualiser la progression via des courbes et des métriques agrégées\.
- Rejoindre un groupe par code d'invitation et quitter un groupe\.
- Gérer le consentement d'accès du coach à ses performances\.
- Recevoir des notifications liées aux séances et aux retours du coach\.

## 3\.4 Collaboration et communication

- Le coach peut commenter une séance ou une performance\.
- L'athlète peut ajouter des notes de contexte et commenter une séance\.
- Les commentaires restent rattachés à une séance ou à une performance pour éviter les discussions décontextualisées\.

# 4\. Règles métier clés

__Règle__

__Description__

__Impact API / données__

RB\-01

Une séance est créée par un seul coach\.

La ressource session référence toujours un owner coach\_id\.

RB\-02

Une séance peut être affectée à plusieurs athlètes\.

Table d'association dédiée \(session\_assignments\)\.

RB\-03

Un athlète ne peut saisir une performance que pour une affectation qui lui est attribuée\.

Performance rattachée à assignment\_id ; consentement requis\.

RB\-04

Un groupe appartient à un coach unique\.

Unicité du coach référent par groupe\.

RB\-05

Le retrait d'un consentement doit stopper les traitements correspondants\.

Logique métier transverse et jobs de purge ciblée\.

RB\-06

L'historique ne doit jamais être modifié sans trace\.

Horodatage et journaux d'audit sur les opérations sensibles\.

RB\-07

L'accès d'un coach à un athlète exige un lien actif\.

Toute lecture/écriture inter\-utilisateurs vérifie coach\_athlete\_links\.

RB\-08

L'accès du coach aux performances exige le consentement « accès coach » actif\.

Condition d'autorisation, pas seulement une option d'UI\.

RB\-09

Une affectation porte au plus une performance\.

Contrainte d'unicité \(assignment\_id\) ; correction tracée\.

RB\-10

Les écritures sensibles sont idempotentes\.

En\-tête Idempotency\-Key sur performance et affectation\.

RB\-11

Les opérations longues sont asynchrones\.

Export et suppression : 202 Accepted \+ ressource de statut\.

# 5\. Modèle fonctionnel des séances et des affectations

Le cycle de vie distingue l'état d'une séance \(porté par la séance\) de l'avancement d'une affectation \(porté par chaque affectation\), conformément à TX\-DATA\-006\.

## 5\.1 État d'une séance

Statut de la ressource session : draft, published, archived\.

- draft \(brouillon\) : la séance n'est pas encore visible par les athlètes\.
- published \(publiée\) : la séance est prête à être affectée\.
- archived \(archivée\) : la séance reste consultable mais n'est plus active dans le planning\.

## 5\.2 Avancement d'une affectation

Statut de la ressource session\_assignment : assigned, in\_progress, completed, skipped\. Les notions « assignée » et « réalisée » relèvent de l'affectation, pas de la séance : une même séance peut être réalisée par un athlète et non commencée par un autre\.

Les transitions d'état sont déterministes et sans effet de bord implicite : publier une séance ne l'affecte pas automatiquement ; affecter ne change pas le statut de la séance\.

# 6\. Modèle d'autorisation et matrice de droits

L'autorisation combine quatre niveaux, tous appliqués côté serveur via des guards : rôle \(RBAC\), appartenance \(lien coach↔athlète actif\), propriété \(ownership\) et consentement\. Le modèle complet figure dans TX\-ARCH\-001 §9 ; la matrice ci\-dessous fait foi pour les contrôles d'accès des ressources d'API et sert de base aux tests d'autorisation\.

__Ressource · action__

__Rôle__

__Condition supplémentaire__

auth\.register / login / refresh

Public

—

auth\.logout / logout\-all

Authentifié

Propriétaire de la session

users\.me \(lire / modifier\)

Authentifié

Propriétaire du compte

users\.me\.consents \(lire / modifier\)

Authentifié

Propriétaire du compte

users\.me\.export / delete

Authentifié

Propriétaire du compte \(asynchrone\)

sessions\.create

Coach

—

sessions\.list

Authentifié

Coach : ses séances ; athlète : ses affectations

sessions\.read

Authentifié

Coach propriétaire OU athlète affecté

sessions\.update / delete / duplicate / archive

Coach

session\.coach\_id = utilisateur \(ownership\)

sessions\.assign

Coach

Ownership de la séance ET athlète\(s\) lié\(s\)

assignments\.list

Athlète

Ses propres affectations

performances\.create

Athlète

Affectation lui appartient ET consentement de traitement actif

performances\.read

Authentifié

Athlète propriétaire OU coach lié \+ consentement « accès coach »

performances\.update

Athlète

Propriétaire de la performance

comments\.create / list

Authentifié

Partie liée à la séance ou à la performance ciblée

athletes\.:id\.stats

Coach

Athlète lié ET consentement « accès coach » actif

athletes\.me\.progress

Athlète

Soi\-même

groups\.\* \(hors join / leave\)

Coach

group\.coach\_id = utilisateur \(ownership\)

groups\.join

Athlète

Code d'invitation valide

groups\.leave

Athlète

Membre actif du groupe

notifications\.devices / preferences

Authentifié

Propriétaire du compte

# 7\. Conventions de conception REST

- Préfixe versionné : /api/v1\.
- Ressources nommées au pluriel : /sessions, /groups, /users\.
- Authentification par en\-tête Authorization: Bearer <accessToken>\.
- Listes : paramètres page, limit, sort, et filtres search, status, from, to\.
- Enveloppe de liste standard : \{ data: \[\.\.\.\], meta: \{ total, page, limit, hasNext \} \}\.
- Idempotence : en\-tête Idempotency\-Key sur les POST d'écriture sensibles \(performance, affectation\) ; rejouer la même clé renvoie le résultat initial\.
- Opérations longues : réponse 202 Accepted avec un identifiant de tâche et une ressource de statut \(export, suppression\)\.
- Rate limiting : réponse 429 avec en\-têtes Retry\-After et RateLimit\-Limit / RateLimit\-Remaining / RateLimit\-Reset\.
- Réponses JSON cohérentes ; horodatages en ISO 8601 UTC\.
- Statuts HTTP : 200, 201, 202, 204, 400, 401, 403, 404, 409, 422, 429, 500\.
- Aucune logique d'autorisation dans le nommage client ; toute décision d'accès est revalidée côté serveur\.

# 8\. Catalogue des ressources API

Le catalogue couvre l'intégralité du catalogue fonctionnel \(section 3\)\. Les accès indiqués résument la matrice de la section 6\.

## 8\.1 Authentification

__Méthode__

__Endpoint__

__Accès__

__Description__

POST

/api/v1/auth/register

Public

Créer un compte \(rôle au choix\)\.

POST

/api/v1/auth/login

Public

Authentifier et délivrer access \+ refresh\.

POST

/api/v1/auth/refresh

Public

Renouveler la session ; rotation et détection de réutilisation\.

POST

/api/v1/auth/logout

Auth

Révoquer le refresh token courant\.

POST

/api/v1/auth/logout\-all

Auth

Révoquer toutes les sessions de l'utilisateur\.

POST

/api/v1/auth/forgot\-password

Public

Déclencher la réinitialisation \(réponse neutre\)\.

POST

/api/v1/auth/reset\-password

Public

Réinitialiser via token à usage unique et expirant\.

POST

/api/v1/auth/2fa/enable

Coach

Activer la 2FA TOTP \(V2\)\.

POST

/api/v1/auth/2fa/verify

Auth

Vérifier un code 2FA\.

## 8\.2 Profil et RGPD

__Méthode__

__Endpoint__

__Accès__

__Description__

GET

/api/v1/users/me

Auth

Récupérer le profil courant\.

PUT

/api/v1/users/me

Auth

Mettre à jour le profil courant\.

GET

/api/v1/users/me/consents

Auth

Lister l'état des consentements\.

PUT

/api/v1/users/me/consents

Auth

Donner ou retirer un consentement \(versionné, horodaté\)\.

POST

/api/v1/users/me/export

Auth

Demander un export \(asynchrone, 202 \+ jobId\)\.

GET

/api/v1/users/me/export/:jobId

Auth

Statut et lien de téléchargement de l'export\.

DELETE

/api/v1/users/me

Auth

Demander la suppression du compte \(asynchrone, 202\)\.

## 8\.3 Groupes

__Méthode__

__Endpoint__

__Accès__

__Description__

POST

/api/v1/groups

Coach

Créer un groupe\.

GET

/api/v1/groups

Coach

Lister ses groupes\.

GET

/api/v1/groups/:id

Coach \(owner\)

Détail d'un groupe\.

PUT

/api/v1/groups/:id

Coach \(owner\)

Modifier un groupe\.

DELETE

/api/v1/groups/:id

Coach \(owner\)

Supprimer \(logique\) un groupe\.

GET

/api/v1/groups/:id/members

Coach \(owner\)

Lister les membres du groupe\.

DELETE

/api/v1/groups/:id/members/:athleteId

Coach \(owner\)

Retirer un athlète du groupe\.

POST

/api/v1/groups/:id/invite\-code

Coach \(owner\)

Régénérer ou révoquer le code d'invitation\.

POST

/api/v1/groups/join

Athlète

Rejoindre un groupe via code\.

POST

/api/v1/groups/:id/leave

Athlète

Quitter un groupe\.

## 8\.4 Séances

__Méthode__

__Endpoint__

__Accès__

__Description__

POST

/api/v1/sessions

Coach

Créer une séance d'entraînement\.

GET

/api/v1/sessions

Auth

Lister \(coach : ses séances ; athlète : affectées\)\.

GET

/api/v1/sessions/:id

Auth

Lire une séance autorisée\.

PUT

/api/v1/sessions/:id

Coach \(owner\)

Modifier une séance\.

DELETE

/api/v1/sessions/:id

Coach \(owner\)

Supprimer \(logique\) une séance\.

POST

/api/v1/sessions/:id/duplicate

Coach \(owner\)

Dupliquer une séance\.

POST

/api/v1/sessions/:id/archive

Coach \(owner\)

Archiver une séance\.

POST

/api/v1/sessions/:id/assign

Coach \(owner\)

Affecter à un ou plusieurs athlètes \(Idempotency\-Key\)\.

## 8\.5 Affectations et performances

__Méthode__

__Endpoint__

__Accès__

__Description__

GET

/api/v1/assignments

Athlète

Lister ses affectations\.

GET

/api/v1/assignments/:id

Auth

Détail d'une affectation autorisée\.

POST

/api/v1/assignments/:id/performance

Athlète

Soumettre la performance \(Idempotency\-Key ; consentement requis\)\.

GET

/api/v1/assignments/:id/performance

Auth

Lire la performance \(athlète ou coach autorisé\)\.

PUT

/api/v1/assignments/:id/performance

Athlète

Corriger la performance \(tracé\)\.

## 8\.6 Collaboration

__Méthode__

__Endpoint__

__Accès__

__Description__

POST

/api/v1/comments

Auth \(lié\)

Commenter une séance ou une performance\.

GET

/api/v1/comments

Auth \(lié\)

Lister les commentaires d'une cible \(filtre session\_id / performance\_id\)\.

DELETE

/api/v1/comments/:id

Auteur

Supprimer son commentaire\.

## 8\.7 Progression et tableau de bord

__Méthode__

__Endpoint__

__Accès__

__Description__

GET

/api/v1/athletes/me/progress

Athlète

Consulter sa propre progression\.

GET

/api/v1/athletes/:id/stats

Coach

Statistiques d'un athlète lié \(consentement requis\)\.

GET

/api/v1/coach/dashboard

Coach

Vue d'ensemble de ses athlètes\.

## 8\.8 Notifications

__Méthode__

__Endpoint__

__Accès__

__Description__

POST

/api/v1/notifications/devices

Auth

Enregistrer un device token \(apns / fcm\)\.

DELETE

/api/v1/notifications/devices/:id

Auth

Révoquer un device token \(déconnexion\)\.

GET

/api/v1/notifications/preferences

Auth

Lire les préférences de notification\.

PUT

/api/v1/notifications/preferences

Auth

Mettre à jour les préférences\.

## 8\.9 Système

__Méthode__

__Endpoint__

__Accès__

__Description__

GET

/api/v1/health

Interne

Liveness \(le service répond\)\.

GET

/api/v1/ready

Interne

Readiness \(dépendances disponibles\)\.

# 9\. Formats d'échange recommandés

## 9\.1 Connexion

POST /api/v1/auth/login

\{ "email": "coach@example\.com", "password": "SecureP@ss123" \}

 

200 OK

\{

  "accessToken": "jwt",

  "refreshToken": "opaque\-token",

  "expiresIn": 900,

  "user": \{ "id": "uuid", "email": "coach@example\.com", "role": "coach" \}

\}

## 9\.2 Renouvellement de session \(rotation\)

Le refresh token est à usage unique\. La réponse fournit un nouveau couple\. La réutilisation d'un jeton déjà consommé invalide toute la famille \(vol présumé\)\.

POST /api/v1/auth/refresh

\{ "refreshToken": "opaque\-token" \}

 

200 OK

\{ "accessToken": "new\-jwt", "refreshToken": "new\-opaque\-token", "expiresIn": 900 \}

 

409 CONFLICT  \(réutilisation détectée → famille révoquée\)

\{ "statusCode": 409, "error": "TOKEN\_REUSE\_DETECTED", "message": "Session invalidated" \}

## 9\.3 Mise à jour d'un consentement

PUT /api/v1/users/me/consents

Authorization: Bearer <accessToken>

\{ "type": "coach\_access", "granted": false, "textVersion": "2026\-01" \}

 

200 OK

\{ "type": "coach\_access", "granted": false, "updatedAt": "2026\-06\-04T10:00:00Z" \}

## 9\.4 Création d'une séance

POST /api/v1/sessions

Authorization: Bearer <accessToken>

\{

  "title": "Force haut du corps A",

  "description": "Focus sur les poussées",

  "scheduledDate": "2026\-04\-15",

  "exercises": \{

    "items": \[

      \{ "name": "Développé couché", "order": 1, "sets": 4, "reps": 8,

        "restSeconds": 120, "notes": "RPE 7\-8" \},

      \{ "name": "Développé militaire", "order": 2, "sets": 3, "reps": 10,

        "restSeconds": 90 \}

    \]

  \}

\}

 

201 Created

\{ "id": "session\-uuid", "title": "Force haut du corps A", "status": "draft",

  "scheduledDate": "2026\-04\-15", "createdAt": "2026\-06\-04T10:30:00Z" \}

## 9\.5 Soumission d'une performance \(idempotente\)

La performance est rattachée à l'affectation\. L'en\-tête Idempotency\-Key absorbe les reprises réseau côté mobile \(saisie hors ligne\)\.

POST /api/v1/assignments/\{assignmentId\}/performance

Authorization: Bearer <accessToken>

Idempotency\-Key: 7b1f0c2e\-\.\.\.\-client\-generated

\{

  "results": \{

    "items": \[

      \{ "exerciseName": "Développé couché", "order": 1,

        "setResults": \[ \{ "set": 1, "reps": 8, "load": \{ "value": 60, "unit": "kg" \} \} \] \}

    \]

  \},

  "rpe": 8,

  "notes": "Bonne séance"

\}

 

201 Created

\{ "id": "perf\-uuid", "assignmentId": "assignment\-uuid", "submittedAt": "2026\-06\-04T18:05:00Z" \}

## 9\.6 Opération asynchrone \(export\)

POST /api/v1/users/me/export      \->  202 Accepted

\{ "jobId": "job\-uuid", "status": "pending" \}

 

GET /api/v1/users/me/export/\{jobId\}  \->  200 OK

\{ "jobId": "job\-uuid", "status": "ready", "downloadUrl": "https://\.\.\./export\.zip",

  "expiresAt": "2026\-06\-05T10:00:00Z" \}

## 9\.7 Réponse de liste paginée

GET /api/v1/sessions?page=1&limit=20&status=published

 

200 OK

\{

  "data": \[ \{ "id": "session\-uuid", "title": "Force haut du corps A", "status": "published" \} \],

  "meta": \{ "total": 42, "page": 1, "limit": 20, "hasNext": true \}

\}

# 10\. Normalisation des erreurs

Toutes les erreurs applicatives respectent une structure stable, produite par un filtre d'exception global, afin d'éviter les traitements spécifiques par écran côté mobile\.

\{

  "statusCode": 422,

  "error": "VALIDATION\_ERROR",

  "message": "Validation failed",

  "details": \[

    \{ "field": "email", "constraint": "isEmail", "message": "email must be a valid email address" \}

  \],

  "timestamp": "2026\-06\-04T10:00:00Z",

  "path": "/api/v1/auth/register"

\}

- Codes d'erreur standard : VALIDATION\_ERROR, UNAUTHORIZED, FORBIDDEN, NOT\_FOUND, CONFLICT, IDEMPOTENCY\_CONFLICT, CONSENT\_REQUIRED, RATE\_LIMITED, INTERNAL\_ERROR\.
- CONSENT\_REQUIRED \(403\) est renvoyé lorsqu'une action est bloquée faute de consentement \(ex\. accès coach aux performances\)\.
- Le champ details est réservé aux erreurs actionnables et n'expose jamais d'information sensible\.
- L'application mobile mappe les codes techniques vers des messages utilisateurs localisés\.

# 11\. Flux applicatifs critiques

## 11\.1 Authentification et renouvellement

Connexion → délivrance d'un access token court et d'un refresh token\. À l'expiration de l'access token, le client renouvelle via le refresh token, qui est aussitôt remplacé \(rotation\)\. Si un refresh token déjà consommé est rejoué, toute la famille est révoquée et l'utilisateur doit se reconnecter\.

## 11\.2 Création et exécution d'une séance

- Le coach crée une séance \(brouillon\), puis la publie\.
- Le coach l'affecte à un ou plusieurs athlètes liés\.
- L'athlète consulte la séance, la réalise et soumet sa performance\.
- Le coach consulte les résultats \(sous consentement\) et peut commenter\.

## 11\.3 Saisie de performance hors ligne

- L'athlète saisit une performance sans réseau ; elle est mise en file localement\.
- À la reconnexion, le client rejoue la requête avec sa clé Idempotency\-Key\.
- Le serveur crée la performance une seule fois ; une reprise renvoie le résultat initial sans doublon\.

## 11\.4 Retrait de consentement

- L'athlète retire un consentement via PUT /users/me/consents\.
- Le changement est horodaté ; le traitement concerné cesse immédiatement \(ex\. l'accès coach aux performances est bloqué\)\.
- Les purges éventuellement nécessaires sont planifiées en tâche asynchrone \(cf\. RB\-05\)\.

## 11\.5 Export et suppression asynchrones

- La demande renvoie 202 Accepted avec un identifiant de tâche\.
- Un worker compile l'export ou exécute l'effacement ; le client suit l'avancement via la ressource de statut\.
- L'export est mis à disposition via un lien signé à durée de vie courte ; l'effacement réel respecte les délais de TX\-SEC\-003\.

# 12\. Recommandations d'implémentation API

- Faire de l'OpenAPI la source de vérité des contrats : générer la documentation et les types client à partir d'elle, plutôt que de maintenir la documentation à la main\.
- Appliquer les contrôles d'autorisation \(section 6\) via des guards transversaux, jamais réimplémentés ad hoc par endpoint\.
- Imposer un filtre d'exception global produisant exactement le schéma d'erreur de la section 10\.
- Éviter les réponses trop riches pour le mobile ; préférer plusieurs ressources ciblées à un payload monolithique\.
- Prévoir des endpoints dédiés aux tableaux de bord si les calculs deviennent coûteux\.
- Maintenir une stricte compatibilité ascendante sur les contrats publics, ou versionner explicitement les ruptures\.
- Mettre en place des tests de contrat mobile↔API et tester systématiquement les scénarios d'autorisation et les cas limites\.

# 13\. Décisions à valider

Arbitrages fonctionnels et d'API à confirmer\.

__Sujet__

__Recommandation par défaut__

__Réf\.__

Notion de « programme » multi\-séances

Hors MVP ; affectation de séances individuelles

3\.2, 5

2FA des comptes coach

Optionnelle, en V2

8\.1

Unicité « une performance par affectation »

Confirmée \(RB\-09\) ; sinon historisation

4, 8\.5

Stratégie de conflit hors ligne

Idempotence \+ dernière écriture gagnante par affectation ; à confirmer

7, 11\.3

Format et livraison de l'export

Archive \(JSON structuré\) via lien signé ; à préciser

8\.2, 9\.6

OpenAPI comme source de vérité

À acter ; artefact séparé généré et versionné

12

Tri et filtres par défaut des listes

À préciser par ressource

7

# 14\. Conclusion

Cette révision aligne les contrats d'API sur les fonctionnalités décrites : chaque capacité du catalogue dispose désormais d'une ressource, le modèle d'autorisation est explicite et testable, et les points sensibles \(consentement conditionnel, idempotence, opérations asynchrones, rotation des jetons\) sont traités\. Le périmètre reste volontairement resserré pour le MVP\.

Les ressources exposées sont peu nombreuses mais suffisamment expressives pour couvrir le MVP et ouvrir la voie aux évolutions : programmes multi\-séances, analytics enrichis, et synchronisation hors ligne plus poussée\. Les arbitrages de la section 13 doivent être confirmés, et l'OpenAPI correspondant établi comme contrat de référence\.

