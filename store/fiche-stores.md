# Talent-X — Fiches stores (App Store / Play Store)

> TLX-77 · jalon « Lancement & Qualité ». Textes **prêts à coller** dans App Store Connect
> et la Play Console. Limites de caractères indiquées et respectées. Langue : FR (marché
> initial). Les éléments **manquants** (visuels, comptes) sont dans
> [checklist-publication.md](checklist-publication.md).

## Identité commune

| Champ            | Valeur                                                   |
| ---------------- | -------------------------------------------------------- |
| Nom de l'app     | **Talent-X**                                             |
| Bundle / package | `com.talentx.app`                                        |
| Catégorie        | Sport (iOS « Sports » · Android « Sports »)              |
| Public           | 13+ (données personnelles ; mineurs : cf. TX-SEC-003 §7) |
| Langue           | Français                                                 |
| Site / support   | `support@talent-x.app` (cf. docs/user/support.md)        |
| Prix             | Gratuit                                                  |

## Sous-titre (iOS, ≤ 30 car.) / Description courte (Android, ≤ 80 car.)

- **iOS (28)** : `Coach & athlètes d'athlétisme`
- **Android (78)** : `L'appli qui relie coachs et athlètes : séances, chronos, records, progression.`

## Mots-clés (iOS, ≤ 100 car.)

```
athlétisme,coach,entraînement,sprint,course,saut,lancer,chrono,record,performance,club,piste
```

## Description longue (iOS ≤ 4000 · Android ≤ 4000)

```
Talent-X relie les coachs d'athlétisme et leurs athlètes autour de l'essentiel :
des séances bien construites, des performances bien mesurées, une progression visible.

POUR LES COACHS
• Construisez vos séances avec des assistants par discipline : sprint, haies,
  demi-fond, sauts, lancers, musculation. « 3 × 60 m récup 8 min » se compose en
  quelques gestes.
• Affectez-les à un athlète ou à tout un groupe, avec échéance et récurrence
  (« chaque mardi jusqu'aux championnats »).
• Des cibles individualisées : programmez à 95 % du record, chaque athlète voit
  SA valeur cible calculée depuis SON record.
• Suivez tout depuis le tableau de bord : perfs à revoir, retards, charge
  d'entraînement (sRPE), présence déclarée sur chaque séance.
• Donnez du feedback directement sur chaque performance — l'athlète est notifié
  et peut répondre.
• Gérez les compétitions : création, engagement des athlètes par épreuve,
  calendrier partagé.

POUR LES ATHLÈTES
• Rejoignez votre coach en scannant son QR code ou avec un code simple.
• Vos séances, votre calendrier, les consignes du coach — avec vos cibles à vous.
• Saisissez vos chronos, distances et barres franchies série par série, même
  SANS RÉSEAU au bord de la piste : tout se synchronise au retour de connexion.
• Vos records personnels détectés et célébrés automatiquement.
• Votre progression saison par saison, y compris vos séances libres (journal
  d'entraînement).
• La vie du groupe : annonces du coach, présence aux séances, encouragements
  entre coéquipiers.

VOS DONNÉES VOUS APPARTIENNENT
• Hébergement en Union européenne.
• Votre coach n'accède à vos données qu'avec votre consentement — révocable à
  tout moment, coach par coach.
• Export complet de vos données et suppression de compte intégrés à l'app.

Talent-X est conçu avec des clubs et des coachs d'athlétisme. Un retour, une
idée ? support@talent-x.app
```

## Notes de version (première publication)

```
Première version publique de Talent-X : séances par discipline, affectations et
récurrences, saisie de perfs hors ligne, records et progression, groupes avec
annonces et présence, compétitions, notifications. Bon entraînement !
```

## Déclarations de confidentialité (à saisir dans les consoles)

Source de vérité : TX-SEC-003 + TX-DPIA-007. Résumé par catégorie store :

| Donnée                                   | Collectée | Liée à l'identité | Finalité                    |
| ---------------------------------------- | --------- | ----------------- | --------------------------- |
| Coordonnées (e-mail, nom)                | Oui       | Oui               | Fonctionnement du compte    |
| Photos (avatar, optionnel)               | Oui       | Oui               | Fonctionnalité (profil)     |
| Santé & forme (perfs, RPE — assimilable) | Oui       | Oui               | Fonctionnalité (suivi)      |
| Identifiants push (token appareil)       | Oui       | Oui               | Notifications               |
| Localisation                             | **Non**   | —                 | —                           |
| Publicité / tracking tiers               | **Non**   | —                 | — (pas de SDK publicitaire) |

- **iOS App Privacy** : « Data Linked to You » = Contact Info, Photos (opt.), Health &
  Fitness, Identifiers. Pas de « Data Used to Track You ».
- **Android Data safety** : chiffrement en transit ✔, suppression sur demande ✔ (in-app),
  pas de partage à des tiers à des fins publicitaires.
- **Permission caméra** (scan du QR d'invitation) : déclarée avec justification
  fonctionnelle ; pas d'accès arrière-plan.
