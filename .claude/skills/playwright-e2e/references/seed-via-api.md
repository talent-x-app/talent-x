# Seed d'un scénario de test via l'API REST

Pourquoi seeder par l'API plutôt que par la base : les comptes **seedés en base ne sont
pas connectables** (hash de mot de passe placeholder). On fabrique donc un scénario réel
en appelant les endpoints REST, exactement comme un client. Le contrat fait foi :
**`docs/talent-x-openapi.yaml`** — vérifier les chemins/payloads exacts avant de coder un
seed, ils peuvent avoir évolué.

La fixture `apiSeed` (`assets/fixtures.ts`) implémente la séquence ci-dessous via le
`request` context de Playwright. **Avantage clé sous Windows** : ce context envoie du JSON
**UTF-8 propre**, contrairement à `curl` dans Git Bash qui corrompt les accents des bodies
(`é`, `è`…). Si on doit absolument seeder en ligne de commande, mettre les prénoms en ASCII
ou passer par `python - <<'PY'` (urllib).

## Séquence éprouvée (parcours coach → athlète → séance)

1. **register coach** — `POST /auth/register` `{ email, password, role: 'coach', firstName, lastName }`
   → récupérer `accessToken`.
2. **créer un groupe** — `POST /groups` (Bearer coach) → récupérer `id` **et `inviteCode`**.
3. **register athlète** — `POST /auth/register` `{ …, role: 'athlete' }` → `accessToken` athlète.
4. **rattacher l'athlète** — `POST /groups/join` (Bearer athlète) `{ inviteCode }` → crée le lien
   coach↔athlète (l'ownership/consentement en dépend).
5. **créer une séance** — `POST /sessions` (Bearer coach) → `id` de séance.
6. **assigner** — `POST /sessions/:id/assign` (Bearer coach). ⚠️ **`Idempotency-Key` requis**
   dans les headers. Une `dueDate` **passée** → l'assignation apparaît en statut « en retard ».

### Pour produire l'état « à revoir » (performance soumise)

7. L'athlète accorde le **consentement RGPD** `data_processing` (endpoint de consentement, cf.
   openapi) — sans ça, l'écriture de performance est refusée.
8. `POST /assignments/:id/performance` (Bearer athlète) → la séance remonte côté coach en
   « à revoir » (KPI `coach-dashboard-kpi-toreview`).

## Pièges

- **Clé RS256 éphémère** : à chaque `nest start`, les tokens des runs précédents sont morts.
  Toujours re-seeder dans le même run que les tests ; ne pas persister un `storageState`
  entre deux sessions d'API.
- **Idempotency-Key** : obligatoire sur `assign` (et potentiellement d'autres écritures).
  Générer une clé unique par appel (la fixture le fait).
- **Ordre des dépendances** : un athlète doit avoir _rejoint_ le groupe avant qu'une séance
  lui soit assignable ; le consentement précède toute écriture de données perso.
- **Port Postgres** : machine de dev souvent sur **5433** (voir `apps/api/.env`), pas 5432.

## Vérifier que l'API répond avant de seeder

```ts
const health = await ctx.get(`${API_URL.replace('/api/v1', '')}/health`);
expect(health.ok(), 'API injoignable sur :3000 — lancer `nest start`').toBeTruthy();
```
