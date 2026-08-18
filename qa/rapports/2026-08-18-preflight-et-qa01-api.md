# Rapport de campagne — 2026-08-18 — Préflight QA-08.1 + QA-01 (volet API)

Première session de la campagne. Périmètre volontairement limité à ce qui ne demande
ni appareil ni boîte mail : le préflight complet et les scénarios d'authentification
pilotables par API. **Deux défauts trouvés, dont un de sécurité.**

## Contexte

|                      |                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Commit déployé (API) | `9cef887` — **à jour** : aucun commit postérieur ne touche `apps/api`, `packages` ou `prisma`    |
| CI                   | ✅ **verte** — confirmée par l'utilisateur (non vérifiable depuis la session : ni `gh` ni jeton) |
| `main` local         | `8b9f3b4`                                                                                        |
| Staging              | `https://staging-api.talent-x.app` — 9 conteneurs, certificat → 2026-11-16                       |
| Appareils            | non sollicités cette session                                                                     |
| Comptes QA           | ⚠️ **pas encore créés** (boîtes réelles requises) — bloque QA-01.1/01.4/01.5                     |
| Préflight QA-08.1    | ⚠️ **1 point rouge** (voir TLX-232), les autres verts                                            |

## Résultats par scénario

| Scénario                                   | Verdict    | Preuve                                                                                                                                                        | Commentaire                                                                                             |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| QA-08.1 — image déployée                   | ✅         | `git log 9cef887..HEAD -- apps/api packages prisma` → vide                                                                                                    | l'image n'est pas périmée pour le backend                                                               |
| QA-08.1 — CI verte                         | ✅         | confirmation utilisateur                                                                                                                                      | hors de portée de la session (ni `gh` ni jeton)                                                         |
| QA-08.1 — health / redirection             | ✅         | `health` 200 `{"status":"ok"}` ; HTTP → 301                                                                                                                   |                                                                                                         |
| QA-08.1 — **readiness**                    | ❌         | 1ᵉʳ appel après boot → **503** `redis:false` ; suivants → 200                                                                                                 | **TLX-232**, reproduit après `restart api`                                                              |
| QA-08.1 — conteneurs                       | ✅         | 7 `Up`, `migrate` + `minio-init` `Exited (0)`                                                                                                                 |                                                                                                         |
| QA-08.1 — certificat                       | ✅         | `notAfter = Nov 16 2026`                                                                                                                                      | ~90 j de marge                                                                                          |
| QA-08.1 — providers worker                 | ✅         | `Push réel actif — APNs:prod FCM:on` · `Email réel actif — Brevo`                                                                                             |                                                                                                         |
| QA-08.1 — clé RS256                        | ✅         | `Keystore RS256 prêt — kid "xzdam5MPtx…"`, **kid identique après redémarrage**                                                                                | clé persistée : les sessions survivent                                                                  |
| QA-08.1 — secrets                          | ✅         | `-rw------- root root /etc/talentx/staging.env`                                                                                                               | corrigé la veille (était `ubuntu:ubuntu`)                                                               |
| QA-08.1 — disque / crédits                 | ✅         | 15 % de 38 Go · Brevo **299** crédits (plan gratuit)                                                                                                          | crédits à surveiller, cf. TLX-233                                                                       |
| QA-01.2 — erreurs de connexion             | ✅         | mauvais mot de passe et compte inexistant → **401 `INVALID_CREDENTIALS`** identiques                                                                          | anti-énumération conforme                                                                               |
| QA-01.2 — **rate limiting**                | ❌         | 15 échecs en rafale → `401 ×15`, **aucun 429**                                                                                                                | **TLX-233** — sécurité                                                                                  |
| QA-01.3 — rotation du refresh              | ✅         | `refresh` 200, nouvelle valeur émise                                                                                                                          |                                                                                                         |
| QA-01.3 — rejeu détecté                    | ✅         | rejeu → **409 `TOKEN_REUSE_DETECTED`** ; le jeton légitime issu de la rotation tombe aussi → 409                                                              | **toute la famille** est révoquée, pas seulement le jeton présenté                                      |
| QA-01.6 — logout                           | ✅         | 204 ; `refresh` ensuite → 409                                                                                                                                 |                                                                                                         |
| QA-01.7 — logout-all                       | ✅         | 204 ; la seconde session tombe → 409                                                                                                                          |                                                                                                         |
| QA-01.8 — 2FA                              | ✅         | `enable2fa` / `verify2fa` → **501 `NOT_IMPLEMENTED`**                                                                                                         | V2 assumée, dégradation propre                                                                          |
| QA-08.7 — redémarrage API                  | ⚠️ partiel | `health` 200 après ~5 s ; kid RS256 inchangé                                                                                                                  | reste à confirmer côté appareil : pas de re-login                                                       |
| QA-01.1 — comptes QA + consentement        | ⚠️ partiel | `+qa-coach` et `+qa-reset` créés ; `consents` → `data_processing / t / 2026-01` pour les deux                                                                 | volet API seul ; la **porte de consentement O-05** reste à voir à l'écran (`+qa-athlete`, sur appareil) |
| QA-01.4 — mot de passe oublié              | ✅         | 202 identiques (compte existant / inexistant) ; **un seul** email parti ; jeton en base, `used_at` nul, expiration à 1 h ; Brevo **`delivered`**              | anti-énumération vérifiée jusqu'à l'**effet**, pas seulement la réponse                                 |
| QA-01.5 — **parcours de réinitialisation** | ❌         | lien = `https://staging-api.talent-x.app/reset-password?token=…` → **404 JSON** ; **zéro** occurrence de `forgotPassword`/`reset-password` dans `apps/mobile` | **TLX-234** — récupération de compte impraticable                                                       |

## Défauts ouverts pendant la campagne

| Ticket      | Sévérité                         | Scénario | Résumé                                                                                                                                                                                 |
| ----------- | -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TLX-234** | **majeur** (bloquant avant prod) | QA-01.5  | Récupération de compte impraticable : aucune UI de réinitialisation dans `apps/mobile` (la maquette O-02 la prévoit pourtant) et le lien de l'email tombe en 404 JSON. TLX-104 rouvert |
| **TLX-233** | **majeur** (bloquant avant prod) | QA-01.2  | Aucun rate limiting : `@nestjs/throttler` absent, le 429 n'existe qu'en annotation OpenAPI alors que TX-SEC-003 le prescrit contre le credential stuffing                              |
| **TLX-232** | mineur                           | QA-08.1  | `/ready` → 503 au premier appel après chaque démarrage (`lazyConnect` + `enableOfflineQueue:false` + `ping()` immédiat)                                                                |

## Vérifié vs supposé

**Mesuré** — image non périmée (diff git) ; santé, redirection, certificat depuis
l'extérieur ; état des 9 conteneurs ; permissions du fichier de secrets ; providers
push et email au démarrage du worker ; **le 503 de `/ready` reproduit à volonté par
`restart api`** ; les 15 `401` sans `429` ; les codes de rotation/rejeu/logout ;
les deux `501` de la 2FA ; 299 crédits Brevo ; persistance de la clé RS256 (kid
identique de part et d'autre d'un redémarrage) ; le **404 du lien de réinitialisation**
(`curl` sur l'URL exacte que compose `EmailProcessor`) et l'**absence totale** d'UI de
réinitialisation dans `apps/mobile` (recherche sur tout le dossier) ; la livraison réelle
de l'email (Brevo `delivered`, à comparer au `hardBounce` du matin sur adresse inventée).

**Supposé / déduit** — (1) **la CI verte** est une confirmation de l'utilisateur, pas une
mesure de la session (ni `gh` ni jeton disponibles) ; (2) l'exposition de
`forgot-password` au flood est établie **par
lecture du code** (`auth.service.ts` : un jeton créé et un email enfilé à chaque appel
pour une adresse existante) et **non par mesure** — la mesurer enverrait de vrais emails
et brûlerait des crédits, ce que la règle §2 du plan interdit ; (3) la survie de la
session mobile au redémarrage de l'API est déduite du kid RS256 inchangé, **pas observée
sur l'appareil**.

## Écarts du registre touchés

| Ligne du registre                                  | État                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 2FA = V2, 501 assumé                               | **Confirmé** — dégradation propre, aucune entrée UI                                                              |
| `/metrics` protégé                                 | **Confirmé** la veille (401 sans jeton) — à rejouer en QA-08.2 complet                                           |
| Brevo plan gratuit (300 crédits)                   | **Confirmé** — 299 restants ; TLX-233 en fait un vecteur d'épuisement                                            |
| Contenu de l'email jamais vu ; lien sur l'hôte API | **Confirmé et aggravé** — le lien tombe en 404 **et** il n'existe aucune UI de réinitialisation → **TLX-234**    |
| Adresses inventées → rebonds                       | **Confirmé par contraste** — `hardBounce` sur l'adresse fabriquée, `delivered` sur l'alias réel. La règle tient. |

## Suites à donner

- [x] ~~Confirmer que la CI est verte sur `8b9f3b4`~~ — confirmé
- [x] ~~Créer les comptes QA sur boîtes réelles~~ — `+qa-coach` et `+qa-reset` créés
- [ ] **Arbitrer TLX-234 avant de le faire coder** : où atterrit le lien de l'email
      (build web hébergé, page dédiée, lien profond, App Links) — choix structurant,
      ADR attendu
- [ ] Faire traiter le **lot 1** (`qa/correctifs/2026-08-18-lot-1.md`) dans une session
      de développement distincte : TLX-234, TLX-233, TLX-232, TLX-231
- [ ] Inscrire `+qa-athlete` **depuis l'app** (QA-01.1 : la porte de consentement O-05 ne
      se vérifie qu'à l'écran)
- [ ] Créer les comptes QA sur boîtes réelles (alias `+qa-coach` / `+qa-athlete` /
      `+qa-athlete2`) → débloque QA-01.1, 01.4, 01.5 et toute la suite
- [ ] Confirmer sur l'appareil que la session a survécu au redémarrage de l'API (QA-08.7)
- [ ] Arbitrer TLX-233 : le corriger avant de poursuivre, ou le porter au backlog de
      pré-production (il ne bloque pas la campagne sur un staging à accès restreint)
- [ ] Poursuivre : QA-01.1 → QA-02 (parcours coach sur appareil)
