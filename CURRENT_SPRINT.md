# Sprint courant : Pilotage coach — couche données + dérivations (backend ✅)

Objectif : construire la **fondation données** du volet coach (séances → affectations →
performances) puis les **dérivations** (`/coach/dashboard`, `/athletes/{id}/stats`), afin
de débloquer les écrans coach C-01/C-02/C-03.

> Ordre choisi : **construire la couche d'abord** (dépendances honnêtes). TLX-080
> dépendait de TLX-070 + TLX-051, eux-mêmes de TLX-050 — tous étaient des stubs `501`.

## À faire (frontend — débloqué)

- **TLX-081** Tableau de bord coach (C-01) — vue principale [PARENT] (dépend de TLX-080 ✅).
- **TLX-044** (C-02) Écran Athlètes — **débloqué** : source « tous mes athlètes » via
  `GET /coach/dashboard` → `athletes[]`.
- **TLX-045** (C-03) Détail athlète — **débloqué** : `GET /athletes/{id}/stats` opérationnel.
- **TLX-052** Constructeur de séance (C-05) [PARENT] + éditeurs de blocs (TLX-053…).
- **TLX-086** Revue de performance + feedback (C-08) — pose le commentaire coach qui sort
  une perf de « à revoir ».

## En cours

- _(rien — backend du sprint terminé)_

## Terminés ce sprint (backend)

- **TLX-050** (API) Séances — **8 endpoints** : CRUD `/sessions` (create/list/get/update/
  delete soft) + `duplicate` + `archive`. Blocs typés JSONB (`ExercisesDoc`), list role-aware
  (coach = siennes / athlète = affectées), ownership via `assertSessionOwnedByCoach`.
  16 tests. **Validé réel (DB)** 14/14. Commit `bfba0ee`.
- **TLX-051** (API) Affectations — `POST /sessions/:id/assign` (coach → athlètes liés,
  idempotent via `ux_assignment_active`) + `GET /assignments` (role-aware) + `GET
/assignments/:id`. En-tête `Idempotency-Key` requis. 13 tests. **Validé réel** 12/12.
  Commits `5573610`, `b1db7f0`.
- **TLX-070** (API) Performances — `POST/GET/PUT /assignments/:id/performance`. 1:1 avec
  l'affectation, idempotent (unicité `assignment_id`), consent-gated (`data_processing` à
  la saisie, `coach_access` à la lecture coach), soumission → affectation `completed`.
  12 tests. **Validé réel** 10/10. Commit `bc7f85e`.
- **TLX-080** (API) Dérivations pilotage coach — `GET /coach/dashboard` (athlètes liés +
  statuts dérivés `late`/`pending_review`/`up_to_date`, KPIs `toReview`/`today`, alertes
  `missedSessions`/`consentMissing`) + `GET /athletes/:id/stats` (consent-gated).
  11 tests. **Validé réel** (dashboard + stats 7/7). Commit `782de28`. **Débloque C-02/C-03.**

Total : **+52 tests API** (168 → 220). Tout poussé sur `main`.

## Notes / dépendances (réutilisables)

- **Mapper séance partagé** : `sessions/session.mapper.ts` (`toSessionDto`).
- **Idempotence sans key-store** : assurée structurellement par les index uniques partiels
  (`ux_assignment_active`, `performances.assignment_id`) — l'en-tête `Idempotency-Key` est
  exigé côté contrat (400 si absent) mais l'effet idempotent vient des clés naturelles.
- **« À revoir »** = perf soumise **sans commentaire du coach** (la revue = TLX-086).
- **« Réalisée »** = affectation `completed`, posée à la soumission de la perf (TLX-070).
- **Portes consentement** (rappel) : `data_processing` (saisie perf athlète),
  `coach_access` (lecture perf + stats côté coach), en plus du lien coach↔athlète actif.
- Base dev : `docker compose up -d` → `prisma migrate deploy` → seed. Port Postgres **5433**.
- Validation réelle : register coach/athlète → join groupe (crée le lien) → assign → perf.
  L'API `pnpm start` sert un `dist/` figé ; pour tester du code frais lancer
  `PORT=3001 nest start` (clé RS256 éphémère → re-login après redémarrage).

## Jalons

- **S-00 Fondations** : ✅ 15/15.
- **S-01 Auth & RGPD** : ✅ clos.
- **S-02 Profils & Groupes** : ✅ clos (TLX-040/041/042/043).
- **Pilotage coach (backend)** : ✅ TLX-050/051/070/080. Reste le frontend
  (C-01/C-02/C-03, constructeur de séance, revue C-08).

## Prochaine étape (proposition)

Frontend coach : **TLX-081** (tableau de bord C-01) en s'appuyant sur `/coach/dashboard`,
puis **TLX-044/045** (C-02/C-03) désormais débloqués. Alternative : **TLX-052**
(constructeur de séance C-05) pour compléter le cycle de création côté coach.
