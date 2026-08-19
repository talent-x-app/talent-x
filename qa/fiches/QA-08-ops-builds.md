# QA-08 — Ops & builds : préflight, artefacts, permissions, identité visuelle

Ce qui encadre la campagne : l'état du staging avant de commencer (08.1 est un
**critère d'entrée**), et la qualité des artefacts eux-mêmes.

## QA-08.1 — Préflight staging (à dérouler au début de CHAQUE campagne)

**Couvre** : `health`, `ready`, l'état complet de la pile.
**Checklist** (commandes §5 du plan) :

- [ ] CI verte, et `IMAGE_TAG` = SHA du **dernier commit de `main` ayant touché autre
      chose que du Markdown** (vérif : `docker compose … config`, ligne `image:`).
      ⚠️ Ce n'est pas forcément `HEAD` : la CI ignore les poussées purement
      documentaires, donc aucune image n'est publiée pour celles-ci. Un `IMAGE_TAG` en
      retard de quelques commits de doc est **normal** ; en retard d'un commit de code
      ne l'est pas. Pour trancher :
      `git log --oneline <IMAGE_TAG_SHA>..main -- . ':(exclude)**/*.md'`
      — s'il ne sort rien, l'image est à jour.
- [ ] `curl https://staging-api.talent-x.app/api/v1/health` → 200 `{"status":"ok"}` ;
      HTTP → 301
- [ ] 9 conteneurs : 7 `Up`, `migrate` + `minio-init` en `Exited (0)`
- [ ] Certificat : `notAfter` > fin de campagne + 15 j (renouvellement certbot sinon)
- [ ] Worker : `Push réel actif — APNs:prod FCM:on` **et** `Email réel actif — Brevo`
      (un `Logging*Provider` = campagne push/email invalide d'avance)
- [ ] API : **pas** d'avertissement de clé RS256 éphémère au démarrage
- [ ] `/etc/talentx/staging.env` en `root:root 600`
- [ ] Espace disque < 70 % ; crédits Brevo restants notés au rapport
- [ ] Comptes QA (boîtes réelles) opérationnels ; scripts pilotes à jour

## QA-08.2 — Endpoints système et exposition

**Couvre** : `metrics` (hors `/api/v1`), surface publique.
**Étapes** : `GET /metrics` sans jeton (attendu **401** — vérifié le 2026-08-18, à
rejouer) ; avec `METRICS_TOKEN` → 200 Prometheus ; balayer quelques ports non-nginx
depuis l'extérieur (`5432`, `6379`, `9000`) → injoignables (Docker contourne ufw : seul
`nginx` publie des ports, les autres services sont en `expose`).
**Preuve** : codes HTTP ; `nmap`/`curl` sur les 3 ports → timeout/refus.

## QA-08.3 — Build preview : le garde-fou et l'artefact

**Couvre** : `check-build-env.js`, profil `preview` d'`eas.json` (45a4945).
**Étapes** : lancer le build `preview` Android **depuis `apps/mobile`** (jamais la
racine — piège TLX-226 : un build racine fabrique un bundle parasite
`com.talentx.talentx`) ; vérifier dans les logs EAS que `[check-build-env]` passe ;
installer l'APK ; parcours fumée **sans Metro** : login → accueil → détail séance →
push reçu.
**Attendu** : l'app autonome vise le staging (URL figée au build) ; le push fonctionne
(`google-services.json` embarqué via `.easignore`).
**Preuve** : log EAS du garde-fou ; parcours fumée OK ; noter le **SHA du build** et sa
**date d'expiration** (internal ≈ 30 j) au rapport.

## QA-08.4 — Build production : l'échec est le comportement attendu

**Couvre** : le garde-fou en négatif (c11c2e5).
**Étapes** : lancer un build `production` **sans** configurer d'URL.
**Attendu** : échec **à la construction** avec le message `EXPO_PUBLIC_API_URL est
vide pour le profil « production »` — c'est le comportement voulu tant qu'aucune API de
production n'existe. Un build production qui **passe** aujourd'hui est un défaut.
**Preuve** : log EAS de l'échec.

## QA-08.5 — Permissions Android déclarées

**Couvre** : la fiche Play (minimisation — visible par l'utilisateur au store).
**Étapes** : extraire les permissions de l'APK preview
(`aapt dump permissions app.apk` ou `apkanalyzer manifest permissions`).
**Attendu** : caméra (QR), notifications — justifiées. **`RECORD_AUDIO` est présente et
ne devrait pas l'être** (héritée du plugin `expo-camera` alors que l'app ne fait que
scanner) — défaut connu à confirmer, ticket à ouvrir si toujours là : c'est un motif de
question en review store et un écart de minimisation.
**Preuve** : liste complète recopiée au rapport, chaque permission justifiée ou
ticketée.

## QA-08.6 — Identité visuelle des artefacts

**Couvre** : TLX-229 (icônes, splash), écarts connus du registre.
**Étapes** : sur l'APK installé : icône du launcher (fond, monogramme), splash screen,
icône de la notification push (statut bar), nom affiché ; `expo export -p web` en local
et contrôler le **favicon** (jamais vérifié) ; comparer le monogramme à l'UI kit
(écart connu : 74 % vs 60,5 %).
**Attendu** : identité conforme au design (`design/`) ; les deux écarts connus sont
soit confirmés (ticket) soit résolus (clore la ligne du registre).
**Preuve** : captures d'écran jointes au rapport.

## QA-08.7 — Résilience de la pile (facultatif, fin de campagne)

**Couvre** : `restart: unless-stopped`, la reprise après incident.
**Étapes** : `sudo docker compose ... restart api` en pleine session app ; observer le
téléphone pendant la coupure (~10 s) et après.
**Attendu** : erreurs actionnables pendant la coupure, reprise **sans déconnexion** de
l'utilisateur après (la clé RS256 est persistée — un redémarrage n'invalide plus les
sessions, contrairement au piège local du 17/08) ; le worker se reconnecte à Redis
seul.
**Preuve** : santé 200 après reprise ; l'app continue sans re-login.
