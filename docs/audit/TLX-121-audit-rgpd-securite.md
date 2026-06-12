# TLX-121 — Audit RGPD & sécurité avant lancement

**Réf. specs :** TX-SEC-003 (`Talent-X_03_Securite_RGPD_v2.md`), TX-DPIA-007 (`Talent-X_07_DPIA_AIPD.md`)
**Jalon :** Lancement & Qualité
**Date :** 2026-06-12 · **Périmètre :** `apps/api` (NestJS) — code réel confronté à la spec
**Statut suite :** API unit **351/351** verts ; correctifs livrés sous ce ticket ; écarts résiduels ticketés.

> Avertissement : audit technique, ne vaut pas avis juridique. Les arbitrages §19 de
> TX-SEC-003 (mineurs, DPIA obligatoire, transferts APNs/FCM, SMTP, DPO) relèvent d'un
> conseil juridique / DPO et restent ouverts (cf. §4 ci-dessous).

## 1. Contrôles vérifiés conformes

| Domaine | Contrôle (TX-SEC-003) | Constat code |
|---|---|---|
| Mots de passe | Hachage fort (§3/§11) | `password.service` — **Argon2id**, params OWASP (19 MiB / t=2 / p=1), sel intégré. ✓ |
| Access token | RS256 court (§11) | `token.service` — JWT **RS256**, `kid` → rotation de clés, issuer + exp vérifiés. ✓ |
| Refresh token | Opaque rotatif + détection réutilisation (§11/§13) | Opaque haché SHA-256, **rotation par famille**, réutilisation → révocation de la famille + 409. Consommation atomique anti-course. ✓ |
| Login | Anti-énumération (§11) | Réponse neutre `401 INVALID_CREDENTIALS`, **decoy hash** pour égaliser le temps. ✓ |
| Inscription | Email unique (§3) | Unicité insensible à la casse sur comptes actifs, course gérée (P2002 → 409). ✓ |
| Autorisation | RBAC + appartenance + ownership + consentement (§11, RB-08) | `roles.guard`, `ownership.service` (lien actif `endedAt: null`), `consent.gate` (4ᵉ niveau). ✓ |
| Consentement | Séparé, append-only, versionné, retrait propagé (§6) | `consents.service` — table append-only, `text_version`, état = dernière ligne ; le gate lit la dernière ligne → **retrait effectif immédiat**. ✓ |
| Effacement | Soft + purge + révocation (§9.2) | `account-deletion.service` — `deleted_at`, **révocation refresh + device tokens**, audit `account.deletion`, purge différée (`account-purge.service`, `ACCOUNT_PURGE_RETENTION_DAYS=30`). ✓ |
| Portabilité / Export | Async, lien court (§9.1) | Pipeline export (ADR-13), TTL archive/URL configurables (`EXPORT_ARCHIVE_TTL_HOURS`, `EXPORT_URL_TTL_SECONDS`). ✓ |
| Secrets | Aucun en dur (§11) | `env.validation` fail-fast : DB/Redis/S3/JWT requis en staging/prod, jamais de défaut secret. ✓ |
| Transferts push | Contenu minimal (§10) | `notification.processor` + `push-provider` — titre/corps **génériques**, `data` = `{type, resourceId}` uniquement, **aucune donnée de perf/santé**, token tronqué dans les logs. ✓ |
| Validation | DTO + whitelist (§11) | ValidationPipe whitelist global, DTO bornés (couvert par suites existantes). ✓ |

## 2. Écarts corrigés sous TLX-121

### 2.1 🔴 `logout` / `logout-all` → 501 (BLOQUANT) — **corrigé**
Routes exposées et documentées OpenAPI, mais `auth.service` renvoyait `notImplemented`.
Conséquence : impossible de **révoquer une session / un refresh token volé** — confinement
d'incident (§13/§15) inopérant.
**Correctif** (`auth.service.ts`) :
- `logout` : révoque le refresh courant (`tokenHash` + `userId`), **idempotent et neutre** (toujours 204) ;
- `logout-all` : révoque **toutes** les sessions actives du titulaire.
- Tests : `auth.service.spec` (+3) — révocation bornée au titulaire, no-op sans token, révocation globale.

### 2.2 🟡 `json-logger` sans redaction (DURCISSEMENT) — **corrigé**
TX-SEC-003 §11/§14 exige des logs « sans fuite de jetons ni de données sensibles » et une
« redaction stricte ». Le logger sérialisait `message` tel quel : aucune fuite constatée
(messages scalaires contrôlés), mais **aucun garde-fou** si un objet sensible est logué.
**Correctif** (`json-logger.ts`) : `redact()` récursif (profondeur bornée) masque les valeurs
des clés `password|token|secret|authorization|refresh|cookie|otp|2fa`. Messages scalaires
inchangés. Tests : `json-logger.spec` (+4).

## 3. Écarts résiduels — ticketés (non bloquants pour ce ticket)

| # | Écart | Sévérité | Ticket |
|---|---|---|---|
| 1 | `forgot-password` / `reset-password` → 501 (récupération de compte). Nécessite table tokens + provider email. | 🟠 Pré-lancement | [TLX-104](https://linear.app/idrissa/issue/TLX-104) (High) |
| 2 | `2fa/enable` / `2fa/verify` → 501 + chiffrement du secret au repos (§12). Marqué **V2** dans le controller. | 🟡 V2 | [TLX-105](https://linear.app/idrissa/issue/TLX-105) (Medium) |

## 4. Arbitrages juridiques / organisationnels ouverts (TX-SEC-003 §19)

Hors code — à trancher avec un conseil juridique / DPO **avant mise en production** :
- **Mineurs (art. 8)** : recommandation par défaut = majeurs uniquement au MVP. `birth_date` déjà prévu au modèle.
- **DPIA (art. 35)** : à traiter comme obligatoire ; document TX-DPIA-007 à finaliser.
- **Transferts APNs/FCM (hors UE)** : mécanisme de transfert à documenter (push déjà minimisés côté code).
- **Localisation SMTP** : à vérifier ; traiter comme transfert si hors UE (lié à TLX-104).
- **DPO** : désignation à évaluer selon l'activité de base.
- **Accords sous-traitance (art. 28)** : OVH / Apple / Google / SMTP — DPA à signer.
- **Outil de gestion des secrets** en production : à choisir (le code n'a aucun secret en dur).

Ces points relèvent de la **checklist de mise en production** (§18), pas du code applicatif.

## 5. Conclusion

Les capacités RGPD/sécurité « exécutables » (consentement conditionnant l'accès, droits
opérationnalisés, refresh rotatif, push minimisés, secrets externalisés) sont **en place et
vérifiées**. Le seul écart **bloquant** côté code (révocation de session) est corrigé ici.
La récupération de mot de passe (TLX-104) reste à livrer avant lancement ; la 2FA (TLX-105)
est un chantier V2. Les arbitrages juridiques du §19 conditionnent la décision finale de
mise en production et sortent du périmètre technique de ce ticket.
