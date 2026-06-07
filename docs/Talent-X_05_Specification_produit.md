__Talent\-X__

__Document 5 — Spécification produit \(PRD\)__

*Vision, personas, parcours, périmètre du MVP et exigences produit de haut niveau\.*

__Référence__

TX\-PRD\-005

__Version__

1\.0

__Date__

4 juin 2026

__Statut__

Spécification produit — cadrage du MVP

__Audience__

Fondateur, contributeurs, parties prenantes \(investisseur, DPO\)

Ce document porte le « pourquoi » et le « quoi » de Talent\-X\. Il précède logiquement les documents techniques du lot \(architecture TX\-ARCH\-001, spécifications et API TX\-SPEC\-002, sécurité/RGPD TX\-SEC\-003, exploitation TX\-OPS\-004, modèle de données TX\-DATA\-006\) et reste cohérent avec eux sans en reprendre le détail technique\. Les valeurs chiffrées sont marquées « \[à valider\] » tant qu'elles ne reposent pas sur des données réelles ; les hypothèses sont signalées ⚠️ et consolidées en section 13\.

__Sommaire__

# 1\. Résumé exécutif

Talent\-X est une application mobile qui relie un coach sportif et ses athlètes autour d'une boucle simple : le coach programme des séances et les affecte à ses athlètes ; l'athlète les consulte sur son téléphone, réalise l'entraînement et saisit ses performances ; les deux suivent la progression dans le temps\. L'objectif est de remplacer les outils dispersés \(tableurs, messageries, notes\) par un espace unique, mobile et fiable\.

Le produit s'adresse en priorité aux coachs indépendants et aux petites structures, ainsi qu'aux athlètes amateurs engagés qu'ils accompagnent\. Sa différence se joue sur trois plans : une expérience de saisie réellement utilisable sur le terrain, y compris hors ligne ; une visibilité claire sur la progression des deux côtés ; et une gestion exemplaire des données personnelles, traitée comme un gage de confiance plutôt que comme une contrainte\.

Ce PRD cadre le périmètre d'un MVP volontairement resserré, réalisable par une équipe très réduite, et fixe explicitement ce qui en est exclu pour éviter la dispersion\.

# 2\. Problème et opportunité

Aujourd'hui, beaucoup de coachs pilotent l'entraînement de leurs athlètes avec un assemblage d'outils non spécialisés : tableurs pour les programmes, messageries pour les échanges, documents pour le suivi\. Cette dispersion fait perdre du temps, complique le suivi de la progression et dégrade l'expérience de l'athlète, qui n'a pas de vue claire et structurée de ce qu'il doit faire ni de ce qu'il a accompli\.

Côté athlète, la saisie des performances est souvent abandonnée parce qu'elle est fastidieuse ou impossible là où l'entraînement a lieu — en salle ou sur le terrain, là où la connexion est mauvaise\. Sans données fiables, le suivi de progression et l'ajustement du programme par le coach reposent sur de l'approximatif\.

L'opportunité est de proposer un espace mobile dédié, centré sur cette boucle coach–athlète, qui rende la programmation rapide, la saisie fiable même hors ligne, et la progression lisible\. La sensibilité des données de performance \(potentiellement liées à la santé\) fait de la confiance et de la conformité un argument différenciant, à condition d'être traitées sérieusement dès le départ\.

__Paysage concurrentiel\. __Le marché compte des acteurs établis sur le coaching et le suivi d'entraînement\. Une analyse concurrentielle structurée reste à mener et figure parmi les questions ouvertes \(section 13\)\. ⚠️

# 3\. Objectifs produit et métriques de succès

Le MVP poursuit quatre objectifs :

- Permettre à un coach de programmer et d'affecter des séances depuis son mobile, sans outil tiers\.
- Offrir à l'athlète une consultation et une saisie simples et fiables, y compris hors ligne\.
- Donner aux deux parties une visibilité claire sur la progression\.
- Garantir une gestion des données personnelles exemplaire \(consentement, export, effacement\) comme socle de confiance\.

__North Star Metric\. __Proportion d'athlètes actifs réalisant au moins une séance avec performance saisie chaque semaine\. Cette métrique capture la santé de la boucle cœur du produit \(programmation → réalisation → saisie\)\.

Indicateurs de soutien \(cibles à fixer sur des données réelles\) :

__Indicateur__

__Définition__

__Cible__

Activation coach

Coach ayant créé un groupe et affecté ≥ 1 séance sous 7 jours

\[à valider\]

Activation athlète

Athlète ayant rejoint un coach et saisi ≥ 1 performance sous 7 jours

\[à valider\]

Rétention W4

Part des athlètes actifs encore actifs à 4 semaines

\[à valider\]

Engagement boucle

Performances saisies par semaine et par athlète actif

\[à valider\]

Consentement accès coach

Part des athlètes liés ayant autorisé l'accès du coach

\[à valider\]

# 4\. Personas

Trois profils principaux structurent le produit : deux côté coach, un côté athlète\.

## 4\.1 Karim — coach indépendant \(cœur de cible\)

__Profil__

Préparateur physique indépendant, suit une vingtaine d'athlètes à distance et en présentiel\.

__Objectifs__

Gagner du temps sur la programmation, suivre ses athlètes sans courir après les retours, paraître professionnel\.

__Frustrations__

Jongler entre tableur et messagerie, relancer les athlètes, perdre le fil de la progression\.

__Attentes__

Créer et réutiliser des séances vite, affecter en quelques gestes, voir d'un coup d'œil qui a fait quoi\.

## 4\.2 Sophie — coach animant un groupe / petite structure \(secondaire\)

__Profil__

Encadre un groupe régulier \(club, association, petit studio\) avec un noyau d'athlètes fidèles\.

__Objectifs__

Diffuser la même séance à tout un groupe, suivre l'assiduité, animer la dynamique collective\.

__Frustrations__

Communiquer la séance à chacun, savoir qui s'est entraîné, gérer les arrivées et départs\.

__Attentes__

Gérer un groupe par code d'invitation, affecter en lot, repérer les absents\.

## 4\.3 Léa — athlète amateure suivie \(cœur de cible\)

__Profil__

Pratiquante régulière \(renforcement, course\), motivée, s'entraîne souvent en salle ou en extérieur\.

__Objectifs__

Savoir clairement quoi faire, garder une trace de ses résultats, voir ses progrès\.

__Frustrations__

Séances envoyées par message difficiles à suivre, saisie impossible sans réseau, pas de vue de progression\.

__Attentes__

Consulter sa séance sur son téléphone, saisir vite ses résultats même hors ligne, visualiser sa progression et recevoir des retours de son coach\.

# 5\. Parcours utilisateurs clés

## 5\.1 Mise en route d'un coach

Karim crée son compte coach, accepte les conditions et la politique de confidentialité, crée son premier groupe, puis sa première séance avec quelques exercices\. Il obtient un code d'invitation à partager avec ses athlètes\.

## 5\.2 Un athlète rejoint son coach

Léa crée son compte athlète, saisit le code d'invitation reçu, rejoint le groupe et établit ainsi un lien avec le coach\. Elle choisit d'autoriser \(ou non\) l'accès de son coach à ses performances\.

## 5\.3 Affectation puis saisie d'une performance \(y compris hors ligne\)

Karim affecte une séance au groupe ou à des athlètes précis\. Léa reçoit une notification, ouvre la séance, réalise l'entraînement et saisit ses résultats — même sans réseau\. Sa saisie est conservée localement puis synchronisée à la reconnexion, sans doublon\.

## 5\.4 Suivi de progression et retour du coach

Léa visualise l'évolution de ses résultats clés\. Karim consulte le tableau de bord de ses athlètes ayant consenti à l'accès, repère l'activité et la progression, et laisse un commentaire sur une performance\.

## 5\.5 Maîtrise de ses données \(RGPD\)

À tout moment, Léa peut consulter et modifier ses consentements, exporter ses données ou supprimer son compte\. Le retrait d'un consentement interrompt le traitement concerné ; la suppression rend le compte inaccessible et efface les données personnelles dans le délai annoncé\.

# 6\. User stories priorisées

Backlog organisé par thème et priorisé en MoSCoW : Must \(indispensable au MVP\), Should \(important, inclus si possible\), Could \(souhaitable, opportuniste\)\. Les exclusions « Won't » de cette version sont traitées en section 8\. Chaque story Must ou Should est accompagnée d'au moins un critère d'acceptation testable \(en italique\)\.

## 6\.1 Compte et authentification

__US\-A1 · Must__ — En tant qu'utilisateur, je veux créer un compte avec mon email et choisir mon rôle \(coach ou athlète\), afin d'accéder à l'application\.

- *Étant donné un email non utilisé, quand je m'inscris avec un mot de passe valide et un rôle, alors mon compte est créé et je suis connecté\.*
- *Étant donné un email déjà associé à un compte actif, quand je tente de m'inscrire, alors l'inscription est refusée avec un message clair\.*

__US\-A2 · Must__ — En tant qu'utilisateur, je veux me connecter et rester connecté, afin de ne pas ressaisir mes identifiants à chaque ouverture\.

- *Étant donné des identifiants valides, quand je me connecte, alors j'accède à mon espace et ma session est maintenue de façon sécurisée\.*

__US\-A3 · Must__ — En tant qu'utilisateur, je veux réinitialiser mon mot de passe, afin de récupérer l'accès en cas d'oubli\.

- *Étant donné un email saisi, quand je demande une réinitialisation, alors un message neutre est affiché sans révéler si le compte existe, et un lien est envoyé si le compte existe\.*

__US\-A4 · Must__ — En tant qu'utilisateur, je veux me déconnecter, afin de protéger mon compte sur un appareil partagé\.

- *Étant donné une session active, quand je me déconnecte, alors la session est révoquée et l'accès nécessite une reconnexion\.*

__US\-A5 · Should__ — En tant que coach, je veux activer une double authentification, afin de mieux protéger les données de mes athlètes\.

- *Étant donné un compte coach, quand le 2FA est activé, alors une étape supplémentaire est exigée à la connexion\.*

## 6\.2 Consentement et droits RGPD

__US\-B1 · Must__ — En tant qu'utilisateur, je veux donner ou retirer mon consentement au traitement de mes données, afin de garder le contrôle\.

- *Étant donné mon espace de confidentialité, quand je retire un consentement, alors le traitement concerné cesse et le changement est horodaté\.*

__US\-B2 · Must__ — En tant qu'athlète, je veux autoriser explicitement mon coach à accéder à mes performances, afin de décider qui voit mes données\.

- *Étant donné un lien avec un coach, quand je n'ai pas donné le consentement d'accès coach, alors le coach ne voit pas mes performances\.*

__US\-B3 · Must__ — En tant qu'utilisateur, je veux exporter mes données, afin d'exercer mon droit à la portabilité\.

- *Étant donné une demande d'export, quand elle est traitée, alors je reçois une archive de mes données dans un format réutilisable\.*

__US\-B4 · Must__ — En tant qu'utilisateur, je veux supprimer mon compte, afin d'exercer mon droit à l'effacement\.

- *Étant donné une suppression confirmée, quand elle est traitée, alors mon compte devient inaccessible et mes données personnelles sont effacées dans le délai annoncé\.*

## 6\.3 Groupes et relation coach\-athlète

__US\-C1 · Must__ — En tant que coach, je veux créer un groupe, afin d'organiser mes athlètes\.

- *Étant donné mon espace coach, quand je crée un groupe, alors il apparaît dans ma liste avec un code d'invitation\.*

__US\-C2 · Must__ — En tant que coach, je veux inviter des athlètes via un code, afin qu'ils me rejoignent simplement\.

- *Étant donné un groupe, quand je partage son code, alors un athlète peut rejoindre le groupe avec ce code\.*

__US\-C3 · Must__ — En tant qu'athlète, je veux rejoindre un groupe avec un code, afin d'être suivi par un coach\.

- *Étant donné un code valide, quand je le saisis, alors je rejoins le groupe et un lien avec le coach est établi\.*

__US\-C4 · Should__ — En tant que coach, je veux retirer un athlète d'un groupe, afin de gérer mon effectif\.

- *Étant donné un athlète membre, quand je le retire, alors il perd l'accès aux contenus du groupe et le lien prend fin pour l'avenir\.*

__US\-C5 · Could__ — En tant que coach, je veux lier directement un athlète sans groupe, afin de gérer un suivi individuel\.

## 6\.4 Séances

__US\-D1 · Must__ — En tant que coach, je veux créer une séance avec une liste d'exercices, afin de planifier l'entraînement\.

- *Étant donné l'éditeur de séance, quand j'ajoute des exercices avec séries, répétitions, charge et repos, alors la séance est enregistrée avec son contenu structuré\.*

__US\-D2 · Must__ — En tant que coach, je veux affecter une séance à un ou plusieurs athlètes, afin qu'ils sachent quoi faire\.

- *Étant donné une séance et des athlètes liés, quand je l'affecte, alors chaque athlète la voit dans son espace\.*

__US\-D3 · Should__ — En tant que coach, je veux dupliquer une séance, afin de gagner du temps\.

- *Étant donné une séance existante, quand je la duplique, alors une copie modifiable est créée sans affecter l'originale\.*

__US\-D4 · Should__ — En tant que coach, je veux archiver une séance, afin de garder mon espace lisible sans perdre l'historique\.

- *Étant donné une séance, quand je l'archive, alors elle disparaît des vues actives mais reste consultable dans l'historique\.*

__US\-D5 · Must__ — En tant qu'athlète, je veux consulter mes séances affectées, afin de savoir quoi réaliser\.

- *Étant donné des séances affectées, quand j'ouvre mon espace, alors je vois la liste de mes séances à réaliser\.*

## 6\.5 Performances \(cœur de la boucle\)

__US\-E1 · Must__ — En tant qu'athlète, je veux saisir mes résultats pour une séance, afin de suivre ce que j'ai réalisé\.

- *Étant donné une séance affectée, quand je saisis mes résultats et soumets, alors ma performance est enregistrée et rattachée à cette affectation\.*

__US\-E2 · Must__ — En tant qu'athlète, je veux saisir une performance même sans connexion, afin de ne pas perdre ma saisie sur le terrain\.

- *Étant donné une absence de réseau, quand je saisis et soumets une performance, alors elle est conservée localement puis synchronisée à la reconnexion, sans doublon\.*

__US\-E3 · Should__ — En tant qu'athlète, je veux indiquer mon effort perçu \(RPE\) et une note, afin de contextualiser ma performance\.

- *Étant donné la saisie d'une performance, quand j'ajoute un RPE et une note, alors ils sont enregistrés avec la performance\.*

__US\-E4 · Should__ — En tant qu'athlète, je veux corriger une performance déjà saisie, afin de rectifier une erreur\.

- *Étant donné une performance soumise, quand je la corrige, alors la valeur est mise à jour de façon tracée, sans doublon silencieux\.*

## 6\.6 Progression et tableau de bord

__US\-F1 · Must__ — En tant qu'athlète, je veux visualiser ma progression dans le temps, afin de rester motivée\.

- *Étant donné un historique de performances, quand j'ouvre ma progression, alors je vois l'évolution de mes résultats clés\.*

__US\-F2 · Must__ — En tant que coach, je veux voir l'activité et la progression de mes athlètes, afin d'ajuster l'entraînement\.

- *Étant donné des athlètes ayant consenti à l'accès coach, quand j'ouvre mon tableau de bord, alors je vois leur statut \(séances réalisées, dernières performances\)\.*

__US\-F3 · Could__ — En tant que coach, je veux repérer les athlètes inactifs, afin de les relancer\.

## 6\.7 Collaboration

__US\-G1 · Should__ — En tant que coach, je veux commenter une performance, afin de donner un retour à l'athlète\.

- *Étant donné une performance d'un athlète lié, quand je laisse un commentaire, alors l'athlète peut le consulter\.*

__US\-G2 · Could__ — En tant qu'athlète, je veux commenter une séance, afin de poser une question à mon coach\.

## 6\.8 Notifications

__US\-H1 · Should__ — En tant qu'athlète, je veux être notifiée quand une nouvelle séance m'est affectée, afin de ne rien manquer\.

- *Étant donné une affectation, quand elle est créée, alors l'athlète reçoit une notification ne contenant aucune donnée sensible\.*

__US\-H2 · Could__ — En tant que coach, je veux être notifié quand un athlète soumet une performance, afin de réagir rapidement\.

# 7\. Périmètre du MVP

Le MVP couvre la boucle complète coach–athlète et les capacités RGPD essentielles\. Il correspond aux stories Must, complétées par les Should réalisables sans alourdir le périmètre\.

- Comptes et authentification sécurisée \(inscription, connexion persistante, réinitialisation, déconnexion\)\.
- Consentements et droits RGPD activables par l'utilisateur \(consentement, accès coach, export, suppression\)\.
- Groupes et lien coach\-athlète par code d'invitation\.
- Création, affectation, duplication et archivage de séances ; consultation côté athlète\.
- Saisie de performances fiable, y compris hors ligne, avec RPE et notes ; correction tracée\.
- Progression côté athlète et tableau de bord de suivi côté coach \(sous consentement\)\.
- Commentaires sur les performances et notifications d'affectation\.

Le MVP cible exclusivement les applications mobiles iOS et Android, avec hébergement des données dans l'UE\.

# 8\. Hors\-périmètre \(non\-goals\)

Pour préserver la vélocité d'une équipe réduite et la clarté du produit, les éléments suivants sont explicitement exclus de cette version\. Les exclure n'est pas les abandonner : c'est différer pour livrer un MVP cohérent\.

__Exclu de cette version__

__Raison / horizon__

Programmes multi\-séances \(collections ordonnées\)

Reporté en V2 ; le MVP s'appuie sur la séance comme unité\.

Monétisation et paiement in\-app

Modèle économique à définir ; hors MVP\. ⚠️

Messagerie temps réel \(chat\)

Le besoin de retour est couvert par les commentaires asynchrones\.

Coaching en direct / visioconférence

Hors de la boucle cœur ; complexité élevée\.

Intégrations objets connectés \(montres, Health, Strava…\)

Forte valeur mais hors MVP ; priorité V2 à arbitrer\. ⚠️

Version web

MVP mobile uniquement ; le web pourra suivre\.

Plusieurs coachs pour un même groupe

Un groupe appartient à un coach unique au MVP\.

Nutrition et suivi alimentaire

Périmètre distinct ; hors cœur produit\.

Annuaire public / marketplace de coachs

Acquisition non couverte par le MVP\.

Hébergement de contenus vidéo d'exercices

Au plus des liens externes ; pas d'hébergement média lourd\.

Ouverture aux mineurs

Statut à trancher ; si exclu, l'inscription est réservée aux adultes\. ⚠️

# 9\. Exigences fonctionnelles de haut niveau

Vue de synthèse des domaines fonctionnels\. Le détail \(règles métier, endpoints, structures de données\) relève des documents techniques référencés ; ce PRD ne les reprend pas\.

__Domaine__

__Attendu produit__

__Référence détail__

Comptes & auth

Inscription, connexion sécurisée, réinitialisation, déconnexion, rôles\.

TX\-ARCH\-001 §4\.4 ; TX\-SPEC\-002

RGPD & consentement

Consentements, accès coach, export, effacement\.

TX\-SEC\-003 ; TX\-DATA\-006

Groupes & liens

Groupes, invitation par code, lien coach\-athlète\.

TX\-SPEC\-002 ; TX\-DATA\-006 §5

Séances

Création, affectation, duplication, archivage, consultation\.

TX\-SPEC\-002 ; TX\-DATA\-006 §5

Performances

Saisie \(hors ligne\), RPE/notes, correction tracée\.

TX\-ARCH\-001 §6\.2 ; TX\-DATA\-006 §5\.6

Progression & dashboard

Visualisation athlète, suivi coach sous consentement\.

TX\-SPEC\-002

Collaboration

Commentaires sur séance / performance\.

TX\-DATA\-006 §6\.1

Notifications

Alertes d'affectation, contenu non sensible\.

TX\-ARCH\-001 §4\.6

# 10\. Contraintes et hypothèses

__Élément__

__Description__

Données sensibles

Les performances peuvent relever de l'article 9 du RGPD ; la conformité est un prérequis, pas une option\.

Équipe réduite

Développement porté initialement par une seule personne : périmètre resserré et priorisation stricte\.

Mobile d'abord

iOS et Android au MVP ; pas de web\.

Hébergement UE

Résidence des données dans l'UE ; exception encadrée pour les notifications push \(hors UE\)\.

Budget maîtrisé

Privilégier des briques légères au MVP\. ⚠️ Enveloppe à confirmer\.

Public adulte

Hypothèse de travail : utilisateurs majeurs au MVP\. ⚠️ À trancher \(cf\. mineurs\)\.

Connectivité variable

L'entraînement a lieu là où le réseau est incertain : le hors\-ligne est un impératif produit\.

# 11\. Risques produit et dépendances

__Risque__

__Impact__

__Mitigation__

Adoption à deux faces \(coach ET athlète\)

Faible activation si l'une des faces n'adhère pas

Soigner le parcours coach \(prescripteur\) ; rendre l'invitation et la prise en main très simples\.

Saisie perçue comme fastidieuse

Abandon de la saisie, données incomplètes, faible rétention

Saisie rapide, hors ligne, RPE/notes optionnels ; minimiser les frictions\.

Dispersion du périmètre \(scope creep\)

Retard de livraison, MVP jamais terminé

Hors\-périmètre explicite \(section 8\) et priorisation MoSCoW tenue\.

Non\-conformité RGPD

Risque juridique et de réputation

Consentement, export, effacement dès le MVP ; DPIA et registre \(TX\-SEC\-003\)\.

Dépendance aux services hors UE \(push\)

Transfert de données hors UE

Contenu de notification non sensible ; transfert documenté \(TX\-ARCH\-001 §4\.6\)\.

Concurrence établie

Différenciation insuffisante

Analyse concurrentielle à mener \(section 13\) ; miser sur fiabilité hors ligne et confiance\.

# 12\. Critères de lancement \(definition of done du MVP\)

Le MVP est prêt à être lancé lorsque l'ensemble des conditions suivantes est satisfait :

- Parcours coach complet : compte → groupe → séance → affectation, fonctionnel de bout en bout\.
- Parcours athlète complet : rejoindre un coach → consulter → saisir une performance \(y compris hors ligne\) → voir sa progression\.
- Droits RGPD opérationnels : consentement, accès coach, export et suppression de compte\.
- Authentification sécurisée conforme aux décisions d'architecture \(sessions courtes, rotation des jetons\)\.
- Notifications d'affectation fonctionnelles, sans donnée sensible dans le contenu\.
- Objectifs non fonctionnels du MVP respectés \(performance et disponibilité, cf\. TX\-ARCH\-001 §10\)\.
- Politique de confidentialité publiée et parcours de consentement en place\.
- Parcours critiques testés \(compte, affectation, saisie hors ligne, export/suppression\)\.
- Applications soumises et approuvées sur l'App Store et le Play Store\.

# 13\. Questions ouvertes et décisions à valider

Décisions produit à trancher pour stabiliser le périmètre et la trajectoire\.

__Sujet__

__Recommandation par défaut__

__Réf\.__

Ouverture aux mineurs

Adultes uniquement au MVP ; consentement parental requis si ouvert

8, 10

Modèle économique

Hors MVP ; définir le modèle et son calendrier

8

Intégrations objets connectés

Reporté ; arbitrer la priorité en V2

8

North Star et cibles chiffrées

À fixer sur des données réelles après lancement

3

Positionnement et sports cibles

Coachs indépendants et petites structures, multi\-sports ; à préciser

2, 4

Analyse concurrentielle

À mener avant les choix de différenciation

2, 11

Programmes multi\-séances

Confirmés en V2 \(hors MVP\)

8

Version web

Reportée après le MVP mobile

8

# 14\. Glossaire

__Terme__

__Définition__

Séance

Unité d'entraînement \(titre, date, exercices\) créée par un coach\.

Affectation

Attribution d'une séance à un athlète ; support de la performance\.

Performance

Résultat saisi par un athlète pour une séance affectée\.

Groupe

Effectif rattaché à un coach unique, rejoint par code d'invitation\.

Lien coach\-athlète

Relation autorisant le suivi par le coach, sous condition de consentement\.

Programme

Collection ordonnée de séances ; concept de V2, hors MVP\. ⚠️

Consentement

Accord explicite, versionné et révocable, conditionnant certains traitements\.

MVP

Version minimale viable : périmètre resserré couvrant la boucle cœur\.

North Star Metric

Indicateur unique reflétant la valeur délivrée et la santé du produit\.

MoSCoW

Priorisation Must / Should / Could / Won't\.

