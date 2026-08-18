# QA-01 — Compte : inscription, session, récupération

Cible : TX-SEC-003 §11, TX-ARCH-001 §8 (rotation), spec §11.1. Appareil : build `preview`.
**Toutes les adresses sont des boîtes réelles** (règle §2 du plan) — les jetons de reset
arrivent par email, une adresse inventée rend QA-01.4/5 injouables et produit des rebonds.

## QA-01.1 — Inscription coach et athlète (O-05)

**Couvre** : `register` + parcours consentement.
**Départ** : aucun compte ; deux boîtes réelles (alias `+qa-coach` / `+qa-athlete`).
**Étapes** : inscription coach depuis l'app (rôle, prénom/nom) → écran Consentement →
accepter ; recommencer côté athlète.
**Attendu** : l'accès à l'app n'est accordé **qu'après** l'étape Consentement (O-05,
TLX-030) ; refus = pas de session.
**Preuve** : `select type, granted, text_version from consents where user_id = '<id>'`
→ `data_processing / true / 2026-01` (version = `CONSENT_TEXT_VERSION` du staging).

## QA-01.2 — Connexion, erreurs, rate limiting

**Couvre** : `login`.
**Étapes** : mauvais mot de passe ×1 (message générique, sans révéler si l'email
existe) ; connexion valide ; enchaîner ~10 tentatives échouées rapides.
**Attendu** : 401 générique ; connexion OK ; **429** au-delà du seuil (spec §10 —
noter le seuil observé au rapport).
**Preuve** : codes HTTP (diagnostic : dev client + Metro, onglet réseau).

## QA-01.3 — Rotation du refresh token et réutilisation

**Couvre** : `refresh` — le refresh est **à usage unique**, sa réutilisation révoque la
famille (TX-ARCH-001 §8).
**Étapes** : laisser l'app tourner au-delà de l'expiration de l'access token (15 min) et
constater le refresh silencieux ; puis rejouer un refresh token déjà consommé (capturé
via le véhicule de diagnostic) : `POST /auth/refresh` avec l'ancien jeton.
**Attendu** : session maintenue sans écran de login ; le rejeu → **409
`TOKEN_REUSE_DETECTED`** et la session de l'appareil devient invalide (retour au login).
**Preuve** : la réponse 409 ; puis `refresh` légitime → 401 (famille révoquée).

## QA-01.4 — Mot de passe oublié (anti-énumération)

**Couvre** : `forgotPassword`.
**Étapes** : demander la réinitialisation pour (a) l'adresse du compte QA, (b) une
adresse **réelle mais sans compte** (autre alias de la même boîte).
**Attendu** : **202 dans les deux cas**, réponses indistinguables ; un seul email reçu
(celui du compte existant).
**Preuve** : les deux 202 ; log worker `Email envoyé : kind=password_reset` (un seul) ;
événement `delivered` côté Brevo — **pas** de `hardBounce`.

## QA-01.5 — Réinitialisation de bout en bout ⚠️ inclut une question ouverte

**Couvre** : `resetPassword`. **Le contenu de l'email n'a jamais été vu** (registre §7).
**Étapes** : ouvrir l'email reçu en QA-01.4 ; examiner le rendu (expéditeur
`noreply@talent-x.app`, texte, mise en forme) ; **suivre le lien et noter précisément où
il atterrit** ; effectuer la réinitialisation avec le jeton ; se reconnecter avec le
nouveau mot de passe ; retenter avec le même jeton.
**Attendu** : mot de passe changé ; **toutes les sessions du compte révoquées** (un
second appareil connecté repasse au login) ; jeton à usage unique (2ᵉ emploi → 422/401
`INVALID_RESET_TOKEN`) ; ancien mot de passe refusé.
**⚠️ Point ouvert à trancher au rapport** : le lien se construit sur `APP_PUBLIC_URL`,
qui vaut l'hôte **API** sur le staging — lequel ne sert aucune app web. Où l'utilisateur
atterrit-il ? Si c'est une impasse, ouvrir un ticket (deep link `talentx://` ou page web
minimale à décider) — c'est un trou de parcours, pas un défaut d'email.
**Preuve** : `select used_at, expires_at from password_reset_tokens where user_id =
'<id>' order by created_at desc limit 1` → `used_at` posé ; connexion OK au nouveau mot
de passe.

## QA-01.6 — Déconnexion

**Couvre** : `logout` (+ révocation du device push, TLX-226).
**Étapes** : se déconnecter depuis le Profil.
**Attendu** : retour au login ; le refresh token de la session est révoqué ; le device
token est révoqué (plus de push — recoupé en QA-05.6).
**Preuve** : `select revoked_at from device_tokens where user_id = '<id>'` → posé.

## QA-01.7 — Déconnexion globale

**Couvre** : `logoutAll`.
**Départ** : le même compte connecté sur **deux** appareils (S20 + iPhone).
**Étapes** : « Déconnecter toutes les sessions » depuis l'appareil A.
**Attendu** : l'appareil B retombe au login à sa prochaine requête (401 → refresh
révoqué → retour login, sans crash ni boucle).
**Preuve** : comportement de B ; aucune session survivante.

## QA-01.8 — 2FA : hors périmètre assumé (test négatif)

**Couvre** : `enable2fa`, `verify2fa` — **V2, `notImplemented` assumé**.
**Étapes** : appeler les deux endpoints (véhicule de diagnostic).
**Attendu** : **501** propre et documenté — pas un 500, pas un écran cassé. Aucune
entrée UI ne doit proposer la 2FA.
**Preuve** : les deux 501.
