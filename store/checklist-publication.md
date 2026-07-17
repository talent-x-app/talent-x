# Talent-X — Checklist de publication iOS/Android

> TLX-77. État au 2026-07-17 : **textes & métadonnées prêts** ([fiche-stores.md](fiche-stores.md)),
> profil de build production configuré (`apps/mobile/eas.json`). Restent des actions qui
> exigent des **comptes développeur** et des **visuels** — listées ici.

## 1. Prêt (dans le repo)

- [x] `eas.json` : profil `production` (Android **app-bundle** ; iOS via EAS).
- [x] `app.json` : `name`, `slug`, `scheme`, `bundleIdentifier`/`package` = `com.talentx.app`,
      permission caméra justifiée (plugin expo-camera), projet EAS lié (compte `talent-x`).
- [x] Textes stores FR complets + déclarations de confidentialité ([fiche-stores.md](fiche-stores.md)).
- [x] Canal support documenté (`docs/user/support.md`) + guides utilisateur.
- [x] Keystore Android géré par EAS (« Build Credentials ulsU0vvdF0 »).

## 2. Bloquants avant soumission (hors repo)

### Comptes & juridique

- [ ] **Compte Apple Developer** (99 $/an) — l'équipe EAS `talent-x` devra y être rattachée
      (`eas credentials -p ios` pour générer certificats/profils).
- [ ] **Compte Google Play Console** (25 $ une fois) + création de la fiche `com.talentx.app`.
- [ ] **Politique de confidentialité hébergée en URL publique** (exigée par les deux stores) —
      dériver de TX-SEC-003/TX-DPIA-007 ; l'URL entre dans les fiches.
- [ ] Mentions « santé/fitness » : vérifier la catégorie de revue Apple (les perfs sportives
      ne sont pas des données médicales — préparer la justification si question de revue).
- [ ] ⚠️ **TLX-142 d'abord** : révoquer/régénérer les secrets push exposés (APNs .p8,
      service account Firebase) **avant** tout build de production.

### Visuels (à produire — aucun asset dans le repo à ce jour)

- [ ] **Icône** 1024×1024 (iOS, sans transparence) + **adaptive icon** Android
      (foreground/background) → champs `icon`/`android.adaptiveIcon` d'`app.json`.
- [ ] **Splash screen** (`expo-splash-screen`).
- [ ] **Captures d'écran** : iPhone 6,7″ et 6,5″ (obligatoires), iPad si supporté (sinon
      désactiver iPad), Android téléphone + tablette 7″/10″ (Play). Parcours suggérés :
      tableau de bord coach, constructeur de séance (carte Sprint), saisie de perf athlète,
      progression/records, hub de groupe, calendrier/compétitions.
- [ ] **Bannière** Play Store (feature graphic 1024×500).

### Versioning

- [ ] `app.json` : `version` (actuel `0.1.0` → passer `1.0.0` au lancement) ;
      `ios.buildNumber` / `android.versionCode` gérés par EAS (`appVersionSource: local` —
      envisager `remote` pour l'auto-incrément).

## 3. Build & soumission (quand §2 est levé)

```bash
# Android (app-bundle signé, keystore EAS)
npx eas-cli build -p android --profile production

# iOS (certificats gérés par EAS, compte Apple requis)
npx eas-cli build -p ios --profile production

# Soumission (renseigner eas.json > submit.production au préalable :
#  - android: serviceAccountKeyPath (compte de service Play, JSON hors repo)
#  - ios: ascAppId / appleTeamId)
npx eas-cli submit -p android --latest
npx eas-cli submit -p ios --latest
```

- [ ] Track **internal testing** Play + **TestFlight** d'abord ; élargir après validation.
- [ ] Vérifier sur build de prod : push réels (TLX-84), deep-link `talentx://`, permission
      caméra, saisie hors-ligne.

## 4. Post-soumission

- [ ] Surveiller les retours de revue (délais typiques : Apple 24-48 h, Play quelques heures).
- [ ] Brancher l'e-mail support dans les fiches + répondre aux avis.
- [ ] Tag git `v1.0.0` + notes de version dans le repo.
