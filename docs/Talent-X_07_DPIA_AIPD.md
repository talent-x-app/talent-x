__Talent\-X__

__Document 7 — Analyse d'impact relative à la protection des données \(AIPD / DPIA\)__

*Projet d'analyse structuré selon la méthode CNIL/EDPB — à compléter et valider par le DPO\.*

__Référence__

TX\-DPIA\-007

__Version__

1\.0 \(projet\)

__Date__

4 juin 2026

__Statut__

Projet d'analyse d'impact \(AIPD\) — à compléter et valider par le DPO ou un conseil juridique

__Avertissement essentiel\. __Ce document est un projet d'analyse d'impact relative à la protection des données \(AIPD / DPIA\) destiné à structurer et accélérer l'analyse à partir du lot documentaire Talent\-X\. Il ne constitue pas un avis juridique et n'a pas valeur d'AIPD validée\. Il doit être complété, vérifié et formellement validé par un DPO ou un conseil juridique compétent, qui rend l'avis prévu à l'article 35\(2\) et statue sur la mise en production\. Les appréciations de gravité, de vraisemblance et de risque résiduel ci\-dessous sont des propositions à valider\.

# Historique des révisions

__Version__

__Date__

__Nature des modifications__

1\.0 \(projet\)

4 juin 2026

Projet initial, structuré selon la démarche CNIL/EDPB, à partir du lot Talent\-X \(TX\-ARCH\-001, TX\-SPEC\-002, TX\-SEC\-003, TX\-DATA\-006, TX\-OPS\-004\)\. Sections d'avis et de décision à compléter par le DPO\.

1\.1 \(projet\)

23 juin 2026

Ajout du flux de **visibilité d'identité pair\-à\-pair** entre coéquipiers d'un groupe \(ADR\-37, endpoint `GET /groups/{id}/teammates` ; suivi TLX\-150\) : nouvelle §5\.5, pointeur en §3\.5 et ligne au plan d'action §6\. Base légale et risque résiduel **proposés, à valider par le DPO** avant mise en production de la fonctionnalité\.

1\.2 \(validé RT\)

23 juin 2026

**Validation du flux §5\.5** par le responsable de traitement : base juridique \(exécution du contrat / intérêt légitime — attente raisonnable « trombinoscope d'équipe »\) et risque résiduel \(Limité\) **retenus**\. Visibilité d'identité pair\-à\-pair **autorisée en production** \(débloque TLX\-185\)\. Cas mineurs : traité au niveau projet \(TX\-SEC\-003 §7\), sans spécificité ajoutée par ce flux \(identité seule, hors art\. 9\)\. Avis formel d'un DPO désigné à recueillir si/quand l'organisation en désigne un \(art\. 35\(2\)\)\.

__Sommaire__

# 1\. Objet et méthode

__Pourquoi cette analyse\. __Le traitement de suivi de performance sportive de Talent\-X porte sur des données pouvant permettre d'inférer la santé \(art\. 9 du RGPD\), de façon systématique et à grande échelle \(suivi régulier d'athlètes\)\. À ce titre, une analyse d'impact est probablement requise au sens de l'article 35\. Son caractère obligatoire est à confirmer par le DPO\.

__Méthode\. __Le document suit la démarche en quatre temps de la CNIL, alignée sur les lignes directrices de l'EDPB : description du traitement \(contexte\), évaluation de la nécessité et de la proportionnalité, mesures protégeant les droits des personnes, appréciation des risques de sécurité, puis plan d'action et validation\.

__Périmètre\. __Le traitement principal « suivi de performance sportive » et les traitements associés : gestion des comptes, collaboration coach\-athlète, notifications et exercice des droits\. L'analyse s'appuie sur le lot documentaire Talent\-X et n'en reprend pas le détail technique\.

Référentiels mobilisés :

- Article 35 du RGPD \(analyse d'impact relative à la protection des données\)\.
- Lignes directrices de l'EDPB sur l'AIPD \(WP248 rév\.01\)\.
- Guide et logiciel PIA de la CNIL \(démarche et échelles de cotation\)\.

# 2\. Description du traitement

## 2\.1 Finalités

- Organiser et diffuser des séances d'entraînement\.
- Enregistrer et suivre les performances et la progression\.
- Permettre au coach d'accompagner l'athlète \(feedback, suivi\)\.
- Faciliter la collaboration et la structuration en groupes\.
- Notifier les utilisateurs des événements pertinents\.

## 2\.2 Données et personnes concernées

__Catégories de données__

Identité, authentification, profil sportif, performances, identifiants d'appareil, logs, exports/sauvegardes \(détail en TX\-SEC\-003 §3\)\.

__Personnes concernées__

Coachs et athlètes\. Mineurs potentiellement concernés \(sport jeunes\) — périmètre à trancher \(TX\-SEC\-003 §7\)\.

__Données sensibles \(art\. 9\)__

Les performances \(charges, RPE, ressenti, paramètres corporels\) peuvent permettre d'inférer la santé : traitées comme données sensibles\.

## 2\.3 Acteurs

__Responsable de traitement__

L'exploitant de Talent\-X \(personne physique ou morale\)\.

__Sous\-traitants__

OVHcloud \(hébergement, UE\), fournisseur SMTP, Apple \(APNs\), Google \(FCM\)\. Registre en TX\-SEC\-003 §17\.

__DPO__

À désigner ou à confirmer selon l'activité de base \(TX\-SEC\-003 §2\)\.

## 2\.4 Flux et cycle de vie des données

- Collecte via l'application mobile \(saisie de séances et de performances\)\.
- Traitement par l'API et le worker \(validation, calculs, notifications, exports\)\.
- Conservation dans PostgreSQL selon des durées bornées \(TX\-SEC\-003 §9\)\.
- Exercice des droits : export structuré et effacement asynchrones \(TX\-SPEC\-002, TX\-SEC\-003\)\.
- Sauvegardes chiffrées \(fenêtre roulante de 30 jours\) ; effacement réel jusqu'à ce délai\.
- Transfert sortant des notifications vers APNs/FCM, hors UE \(TX\-SEC\-003 §10\)\.

## 2\.5 Supports \(actifs\)

Application mobile \(React Native/Expo\), API NestJS, worker, PostgreSQL, Redis, stockage objet, hébergement OVHcloud \(UE\), services tiers APNs/FCM/SMTP\. La vue d'architecture \(C4\) figure dans TX\-ARCH\-001\.

# 3\. Nécessité et proportionnalité

## 3\.1 Bases juridiques

- Compte et fourniture du service : exécution du contrat \(art\. 6\(1\)\(b\)\)\.
- Données de performance sensibles : consentement explicite \(art\. 9\(2\)\(a\)\), séparé, tracé et révocable\.
- Sécurité et journalisation : intérêt légitime, avec minimisation\.

## 3\.2 Minimisation

- Ne collecter que les données nécessaires aux finalités ; pas d'analytics intrusif au MVP\.
- Contenu des notifications push minimal : aucun résultat de performance ou donnée de santé dans le corps de la notification\.

## 3\.3 Qualité et exactitude

Édition du profil par l'utilisateur ; correction tracée de l'historique sans modification silencieuse \(RB\-06\) ; droit de rectification opérationnalisé \(TX\-SEC\-003 §8\)\.

## 3\.4 Durées de conservation

Durées bornées par catégorie \(TX\-SEC\-003 §9\) : compte actif, performances limitées dans le temps, logs 90 jours, sauvegardes 30 jours, exports 7 jours\. Le délai réel d'effacement \(jusqu'à 30 jours\) est annoncé dans la politique de confidentialité\.

## 3\.5 Information et transparence

Politique de confidentialité et écrans d'onboarding ; registre des traitements tenu \(art\. 30, TX\-SEC\-003 §5\)\.

La **visibilité d'identité pair\-à\-pair** au sein d'un groupe \(« trombinoscope d'équipe », cf\. §5\.5\) doit être **mentionnée explicitement dans la notice de confidentialité** avant la mise en production : un athlète membre voit le nom \(et l'avatar\) de ses coéquipiers du même groupe\. À tracer aussi dans le registre des traitements \(nouveau flux de partage entre utilisateurs\)\. *\(TLX\-150 — validé RT le 23/06/2026 ; cf\. §5\.5\.\)*

# 4\. Mesures protégeant les droits des personnes

__Droit__

__Mesure__

__Réf\.__

Information

Politique de confidentialité et écrans d'onboarding

SEC §8

Consentement

Écran dédié sans case pré\-cochée ; retrait à tout moment ; « accès coach » conditionnant l'accès \(RB\-08\)

SEC §6

Accès

Consultation in\-app et export des données

SPEC §8\.2

Rectification

Édition du profil ; correction tracée de l'historique

RB\-06

Effacement

Suppression de compte \(asynchrone\) puis purge

SEC §9\.2

Portabilité

Export structuré et réutilisable

SEC §9\.1

Limitation

Procédure de gel du traitement sur demande

SEC §8

Opposition

Retrait de consentement et opposition aux traitements concernés

SEC §6

Sous\-traitants et transferts : accords de sous\-traitance \(art\. 28\) à signer ; transferts hors UE \(push\) encadrés et minimisés, mécanisme à vérifier \(TX\-SEC\-003 §10 et §17\)\.

# 5\. Appréciation des risques

Les risques de sécurité sont évalués selon la méthode des trois événements redoutés \(CNIL\), cotés en gravité et en vraisemblance sur une échelle à quatre niveaux\. Les cotations ci\-dessous sont des propositions à valider par le DPO\.

__Niveau__

__Lecture indicative__

Négligeable

Les personnes ne seront pas impactées ou de façon négligeable\.

Limité

Désagréments surmontables \(effort, stress\)\.

Important

Conséquences significatives et difficiles à surmonter\.

Maximal

Conséquences graves, potentiellement irréversibles\.

## 5\.1 Accès illégitime aux données \(confidentialité\)

__Événement redouté__

Divulgation de données de performance pouvant inférer la santé\.

__Sources de risque__

Attaquant externe, sous\-traitant, erreur interne\.

__Principales menaces__

Vol de jeton, injection, escalade, accès du coach sans consentement, fuite via logs, compromission d'un export, transfert hors UE non maîtrisé\.

__Impacts pour les personnes__

Atteinte à la vie privée, inférence de santé, stigmatisation\.

__Gravité \(proposée\)__

Importante \(données pouvant inférer la santé\)\.

__Vraisemblance \(proposée\)__

Limitée, compte tenu des mesures\.

__Mesures en place ou prévues__

TLS 1\.3 et chiffrement au repos ; RBAC \+ appartenance \+ ownership \+ consentement \(RB\-08\) ; rotation et détection de réutilisation des jetons ; reset anti\-énumération ; redaction des logs ; exports chiffrés à durée de vie courte ; minimisation du contenu des push\.

__Risque résiduel \(proposé\)__

Limité — à valider\.

## 5\.2 Modification non désirée des données \(intégrité\)

__Événement redouté__

Altération non autorisée de performances ou de l'historique\.

__Sources de risque__

Utilisateur malveillant, défaut applicatif, escalade de privilèges\.

__Principales menaces__

Écriture non autorisée, perte d'intégrité, doublons\.

__Impacts pour les personnes__

Décisions d'entraînement faussées, perte de confiance\.

__Gravité \(proposée\)__

Limitée\.

__Vraisemblance \(proposée\)__

Limitée\.

__Mesures en place ou prévues__

Contraintes d'intégrité en base \(TX\-DATA\-006\) ; journal d'audit et historique non modifiable sans trace \(RB\-06\) ; correction tracée ; autorisation par guards ; idempotence des écritures\.

__Risque résiduel \(proposé\)__

Limité à négligeable — à valider\.

## 5\.3 Disparition des données \(disponibilité\)

__Événement redouté__

Perte de données ou indisponibilité du service\.

__Sources de risque__

Panne, incident d'hébergement, suppression accidentelle\.

__Principales menaces__

Perte de volume, sinistre, corruption\.

__Impacts pour les personnes__

Perte de l'historique, interruption du suivi\.

__Gravité \(proposée\)__

Limitée\.

__Vraisemblance \(proposée\)__

Limitée\.

__Mesures en place ou prévues__

Sauvegardes chiffrées hors nœud et clés conservées hors nœud ; tests de restauration ; PRA/PCA ; monitoring \(TX\-OPS\-004 §8\)\.

__Risque résiduel \(proposé\)__

Négligeable à limité — à valider\.

## 5\.4 Points d'attention spécifiques

- Mineurs : si le périmètre inclut des mineurs, la gravité des événements redoutés augmente et des mesures dédiées sont requises \(vérification d'âge, consentement parental\) — décision à trancher \(TX\-SEC\-003 §7\)\.
- Transferts hors UE \(push\) : risque de conformité à lever par la vérification du mécanisme de transfert et la minimisation du contenu des notifications \(TX\-SEC\-003 §10\)\.

## 5\.5 Visibilité d'identité pair\-à\-pair \(coéquipiers de groupe\)

*\(Ajout TLX\-150 / ADR\-37 — projet, à valider par le DPO\.\)*

__Flux nouveau\. __Jusqu'ici, la composition d'un groupe n'était visible que du **coach propriétaire** \(`GET /groups/{id}/members`\) ; l'athlète ne voyait qu'un **effectif** \(`memberCount`, ADR\-26\)\. ADR\-37 introduit `GET /groups/{id}/teammates` : un athlète **membre actif** d'un groupe voit désormais l'**identité** \(nom, prénom, avatar\) de ses coéquipiers du **même** groupe\. C'est un **partage d'identité entre utilisateurs**, distinct du partage coach↔athlète déjà analysé\.

__Données partagées \(minimisées, schéma `GroupTeammate`\)\. __`firstName`, `lastName`, `avatarUrl` uniquement\. **Exclus** : e\-mail, sport, date d'adhésion, et **toute** donnée de performance / charge / santé \(qui restent consent\-gated et coach\-scopées, ADR\-08/21\)\. Aucune donnée de l'art\. 9 n'est exposée par ce flux\.

__Périmètre & garde\. __Visibilité **bornée aux co\-membres d'un groupe que l'athlète a lui\-même rejoint** \(garde d'appartenance active ; 404 anti\-énumération sinon\)\. **Exclusions systématiques** : membres partis \(`left_at`\), groupes supprimés \(`deleted_at`\), comptes effacés/anonymisés \(ADR\-15\) — l'anonymisation se reflète dans le roster\.

__Base juridique \(validée RT, 23/06/2026\)\. __Exécution du contrat / **intérêt légitime** \(art\. 6\(1\)\(b\)/\(f\)\) : la visibilité de l'identité au sein d'un groupe d'entraînement relève de l'**attente raisonnable** d'un « trombinoscope d'équipe » \(on rejoint un groupe nommé, animé par un coach identifié, pour s'entraîner avec d'autres\)\. **Pas** de catégorie spéciale \(art\. 9\) → **pas** de porte de consentement \(cohérent ADR\-24/26\)\. Information assurée par la notice de confidentialité \(§3\.5\)\. **Cas mineurs** : pas de spécificité ajoutée par ce flux \(identité seule\) ; traité au niveau projet \(TX\-SEC\-003 §7\)\. Avis formel d'un DPO désigné à recueillir le cas échéant \(art\. 35\(2\)\)\.

__Événement redouté\. __Visibilité non souhaitée de son identité par un coéquipier ; persistance de l'identité après départ du groupe\.

__Gravité \(proposée\)\. __Limitée — identité seule, sans donnée sensible, dans un cercle déjà partagé \(même groupe, même coach\)\.

__Vraisemblance \(proposée\)\. __Limitée — périmètre membre\-gated, schéma minimisé, exclusion des départs/anonymisations\.

__Mesures en place ou prévues\. __Schéma dédié minimisé \(pas de réutilisation de `UserSummary`\) ; garde d'appartenance active ; filtrage `left_at`/`deleted_at`/anonymisés ; avatar présigné best\-effort à TTL court \(sinon omis\) ; endpoint **isolé et désactivable** \(repli effectif seul, ADR\-26\)\.

__Risque résiduel \(validé RT, 23/06/2026\)\. __Limité — **acceptable, mise en production autorisée**\. **Repli** disponible si besoin : revenir à l'effectif seul \(endpoint retiré/désactivé, additif et réversible\)\.

## 5\.6 Visibilité de présence confirmée entre coéquipiers \(Mur Palier 2 / kudos\)

*\(Ajout TLX\-185 / ADR\-49 — validé RT le 23/06/2026\.\)*

__Flux nouveau\. __Le « kudos de participation » \(Mur Palier 2, ADR\-48/ADR\-49\) permet à un athlète
d'**encourager** un coéquipier qui a **confirmé sa présence** \(`attendance = going`, ADR\-43\) à une
séance de groupe\. Il suppose donc qu'un athlète **voie qu'un coéquipier a confirmé** — une visibilité
de **présence** pair\-à\-pair, **distincte** du trombinoscope d'identité \(§5\.5\) et que ADR\-43 §5 avait
différée à la présente AIPD\.

__Données partagées \(minimisées\)\. __Le **fait** qu'un coéquipier a confirmé sa présence à une séance
de groupe \(booléen de présence `going`\), \+ son identité minimisée \(`GroupTeammate`, §5\.5\) comme
auteur/destinataire d'un kudos\. **Exclus** : motif d'absence, ressenti, **toute** donnée de
performance / charge / record \(consent\-gated, coach\-scopées, ADR\-08/21\)\. Le kudos porte sur le
**fait de venir**, jamais sur un résultat\.

__Périmètre & garde\. __Visibilité **bornée aux co\-membres d'un groupe partagé** vers lequel la séance
a été diffusée \(fan\-out ADR\-30\) ; uniquement sur les présences **`going`** ; exclusion des membres
partis / groupes supprimés / comptes anonymisés\. Notification `group_kudos` au destinataire, gatée par
sa préférence `groupUpdates`, contenu push minimal \(ADR\-10\)\.

__Base juridique \(validée RT, 23/06/2026\)\. __Même base que §5\.5 — exécution du contrat / intérêt
légitime \(art\. 6\(1\)\(b\)/\(f\)\), **attente raisonnable** d'un contexte d'équipe \(s'entraîner ensemble
implique de savoir qui vient\)\. La présence n'est **pas** une donnée de l'art\. 9 \(participation ≠
santé, ADR\-24/43\) → **pas** de porte de consentement\. Information par la notice de confidentialité\.

__Gravité / vraisemblance / risque résiduel \(validés RT\)\. __Limités — encouragement positif, donnée
de présence non sensible, cercle déjà partagé \(même groupe, même coach\)\. **Repli** : désactiver le
kudos \(table/route isolées\) → retour aux réactions nominatives \(§5\.5\) puis au Palier 1, sans
régression\.

## 5\.7 Consentement `coach_access` par coach \(multi\-coach, ADR\-51 §D2\)

*\(Ajout TLX\-187 / ADR\-51 — note versée à l'AIPD le 17/07/2026\.\)*

__Évolution\. __L'appartenance **multi\-coach** \(ADR\-51\) fait passer le consentement `coach_access`
d'un réglage **global** \(un seul interrupteur couvrant tous les coachs liés\) à un consentement
**scopé au coach** : l'athlète peut consentir à l'accès d'un coach **sans** consentir aux autres, et
révoquer **un seul** coach\. Mise en œuvre additive : colonne `coach_id` nullable sur la table
append\-only `consents` \(NULL = décision globale historique\) ; l'état courant pour un coach = la
**dernière ligne applicable** \(scopée à ce coach ou globale\), une décision globale plus récente
l'emportant dans les deux sens\.

__Portes couvertes\. __Les six lectures coach consent\-gated \(détail de perf, feedback, progression,
stats, records, charge d'entraînement du dashboard\) passent désormais le `coachId` appelant — en
complément du **cloisonnement** des lectures par coach \(ADR\-51 §D3, déjà livré\)\.

__Geste d'adhésion\. __Rejoindre un groupe par code d'invitation **vaut consentement** `coach_access`
au coach de ce groupe \(ligne scopée historisée, art\. 7 : trace de l'acte positif\) ; aucune ligne
redondante si un consentement actif couvre déjà ce coach\. Le retrait reste **aussi simple que
l'octroi** \(RB\-05\) : interrupteur par coach dans Profil → Confidentialité\.

__Effet sur les risques\. __Réduction du risque « accès du coach sans consentement » \(§4\) : le
périmètre du consentement épouse désormais la relation réelle coach↔athlète \(granularité, art\. 7\(2\)
- minimisation\)\. Aucune donnée nouvelle n'est collectée ; `coach_id` est une méta\-donnée de
consentement\. Rétrocompatibilité mono\-coach : comportement inchangé \(NULL = global\)\.

## 5\.8 Visibilité de la photo de profil entre coach et athlète \(ADR\-37 amendé\)

*\(Ajout TLX\-252 / ADR\-37 §A1–A5 — amendement du 20/08/2026\.\)*

__Évolution\. __La photo de profil \(`users.photo_url`, avatar TLX\-124\) devient visible **dans les
deux sens** de la relation coach↔athlète : un coach voit la photo des athlètes de ses groupes
\(roster de groupe, tableau de bord\), un athlète voit celle de **son** coach \(carte « Ton coach »\)\.
Jusqu'ici aucun des deux sens ne fonctionnait — non par défaut d'implémentation mais **par le
contrat** : `GroupMember.athlete` et `AthleteGroup.coach` portaient `UserSummary`, dépourvu
d'avatar\. Seule la vue **pair\-à\-pair** \(§5\.5\) exposait un avatar\.

__Données partagées\. __L'**avatar seul**, sous forme d'**URL présignée à TTL court**
\(`AVATAR_URL_TTL_SECONDS`, défaut 3600 s\), omise si le stockage est indisponible \(repli sur les
initiales\)\. **Exclus** de ces surfaces, inchangés : e\-mail, date de naissance, et toute donnée de
l'art\. 9\. La vue **pair\-à\-pair** \(§5\.5\) n'est **pas** élargie par cet amendement\.

__Nécessité et proportionnalité\. __Le canal coach↔athlète transporte déjà, sous consentement
`coach_access` **scopé par coach** \(§5\.7, ADR\-51 §D2\), des données nettement plus sensibles :
performances, charge d'entraînement, assiduité, RPE\. La photo de profil est la donnée **la moins
sensible** de ce canal ; elle **n'ajoute aucune catégorie de traitement**\. Finalité : reconnaître
son interlocuteur dans une relation d'entraînement nominative et déjà consentie\. Le sens
athlète→coach est symétrique et sans enjeu supplémentaire \(le coach est déjà identifié nominativement
par ADR\-26\)\.

__Base juridique\. __Inchangée — exécution de la relation d'entraînement + consentement `coach_access`
pour le sens coach→athlète\. Aucun consentement **nouveau** n'est requis : le périmètre du
consentement existant couvre ce flux\. Le retrait du consentement, ou la sortie du dernier groupe du
coach \(`endLinkIfLastGroup`, ADR\-51 §D5\), ferme l'accès **y compris à l'avatar**\.

__Mesures en place\. __Schéma **présenté dédié** \(`LinkedUserSummary`\) appliqué **surface par
surface** plutôt qu'un `UserSummary` élargi — la décision d'exposition reste lisible à l'endroit où
elle est prise et n'atteint pas les surfaces non visées \(`Announcement.author` reste sans avatar\) ;
présignature **best\-effort** à TTL court via un présentateur **unique** \(`TeammatePresenter`\), donc
pas d'URL permanente ni d'objet public ; gardes d'autorisation **existantes et inchangées**
\(ownership du groupe, scope coach, appartenance de l'athlète\) — un coach non lié n'atteint aucune
de ces routes ; suppression de la photo \(`DELETE`\) effective immédiatement, l'URL présignée
survivante expirant au plus tard au TTL\.

__Effet sur les risques\. __Neutre sur §5\.1 \(accès illégitime\) : aucune porte nouvelle, aucune
donnée d'une catégorie nouvelle sur un canal déjà analysé\. Risque résiduel **faible** : une URL
présignée déjà émise reste valide jusqu'à expiration après retrait du consentement ou suppression de
la photo — borné par le TTL, identique au risque déjà accepté en §5\.5\.

# 6\. Plan d'action et risques résiduels

__Action__

__Priorité__

__Réf\.__

__Statut__

Faire valider l'AIPD et recueillir l'avis du DPO \(art\. 35\(2\)\)

Haute

§7

À faire

Trancher la place des mineurs \(art\. 8\)

Haute

SEC §7

À décider

Vérifier le mécanisme de transfert APNs/FCM et minimiser les push

Haute

SEC §10

À faire

Signer les accords de sous\-traitance \(art\. 28\)

Haute

SEC §17

À faire

Définir le périmètre du chiffrement applicatif de champs

Moyenne

SEC §12

À décider

Confirmer les durées de conservation et le délai d'effacement

Moyenne

SEC §9

À confirmer

Mettre en place le registre des violations et la procédure 72 h

Moyenne

SEC §15

À faire

Désigner ou confirmer le DPO

Moyenne

SEC §2

À évaluer

Tester de bout en bout l'export et l'effacement

Moyenne

OPS §6

À faire

Valider la visibilité d'identité pair\-à\-pair \(base légale, notice, registre\) — coéquipiers de groupe

Haute

§5\.5 / ADR\-37 / TLX\-150

**Validé \(RT, 23/06/2026\)** — Palier 2 \(TLX\-185\) débloqué\. Reste : aligner `.docx/.pdf` originaux ; avis DPO formel si désigné\.

Sous réserve de la mise en œuvre du plan d'action et de la validation du DPO, le risque résiduel global est estimé acceptable \(proposition à valider\)\. Les deux points ouverts à plus fort enjeu sont la place des mineurs et l'encadrement des transferts hors UE\.

# 7\. Avis et validation

Section à compléter par le DPO et le responsable de traitement\.

__Avis du DPO__

À compléter \(art\. 35\(2\)\)\.

__Avis des personnes concernées__

À recueillir et documenter le cas échéant \(art\. 35\(9\)\)\.

__Décision sur la mise en production__

À statuer par le responsable de traitement au vu du risque résiduel\.

__Prochaine revue__

Date à fixer ; révision en cas de changement substantiel du traitement\.

Événements déclenchant une nouvelle évaluation :

- Nouveau type de données ou nouvelle finalité\.
- Extension du périmètre aux mineurs\.
- Nouveau sous\-traitant ou nouveau transfert hors UE\.
- Incident de sécurité majeur ou violation de données\.
- Évolution réglementaire significative\.

# 8\. Conclusion

Ce projet d'analyse d'impact montre que Talent\-X intègre dès la conception des mesures proportionnées au caractère sensible des données traitées\. Le risque principal — l'accès illégitime à des données pouvant inférer la santé — est réduit par des mesures techniques et organisationnelles déjà spécifiées dans le lot documentaire : chiffrement, autorisation conditionnée au consentement, journalisation maîtrisée, minimisation des notifications et sauvegardes protégées\.

La finalisation de l'AIPD passe par la validation du DPO, le recueil de son avis formel et le traitement des deux points ouverts à plus fort enjeu : la place des mineurs et l'encadrement des transferts hors UE\. Le plan d'action de la section 6 en constitue la feuille de route\.

