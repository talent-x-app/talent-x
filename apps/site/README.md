# Site public Talent-X

Site **statique, sans build et sans dépendance d'exécution** — décision ADR-57. Servi tel
quel par le Nginx déjà déployé (`deploy/staging/`), à partir de `public/`.

## Pourquoi il existe

Le lien de réinitialisation de mot de passe envoyé par email doit aboutir quelque part.
Il pointait `APP_PUBLIC_URL`, qui valait l'hôte de l'**API** : un clic renvoyait un 404
JSON brut, et personne ne pouvait récupérer son compte (TLX-234, mesuré en campagne).

La contrainte décisive est que la récupération doit fonctionner **sans l'application** :
téléphone changé, réinstallation, ou mail ouvert depuis un ordinateur. C'est ce qui écarte
le lien profond `talentx://` — inopérant si l'app n'est pas installée, et souvent non
cliquable depuis un client mail. Le raisonnement complet, et les autres options écartées,
sont dans `docs/adr/ADR-57-destination-lien-reinitialisation.md`.

## Contenu

| Route             | Fichier                      | État                                           |
| ----------------- | ---------------------------- | ---------------------------------------------- |
| `/reset-password` | `public/reset-password.html` | Livré (TLX-234)                                |
| `/privacy`        | —                            | **À écrire** — bloquant de publication, TLX-77 |
| `/support`        | —                            | **À écrire** — TLX-77                          |

`/privacy` et `/support` sont prévus par l'ADR mais **volontairement non livrés ici** : la
politique de confidentialité est un texte juridique à dériver de TX-SEC-003 et du DPIA,
pas à improviser depuis un ticket de correction. L'infrastructure les attend — un fichier
`.html` déposé dans `public/` est servi sans autre changement.

## Règles à ne pas relâcher

- **Aucun script tiers, aucune analytics.** Le jeton de réinitialisation transite dans
  l'URL. C'est aussi pourquoi `assets/site.css` recopie quelques tokens de
  `design/tokens.css` au lieu de l'importer : ce fichier tire Poppins depuis le CDN de
  Google Fonts.
- **Aucune valeur d'environnement en dur.** L'URL de l'API arrive par `/assets/config.js`,
  synthétisé côté serveur : par le bloc Nginx en staging/production (dérivé d'`API_HOST`),
  par `scripts/serve.mjs` en local. Aucun fichier de configuration n'est versionné.
- **Le jeton est retiré de l'URL au chargement** (`history.replaceState`), pour qu'il ne
  reste ni dans la barre d'adresse, ni dans l'historique, ni dans un référent.

## Développement

```bash
pnpm --filter @talent-x/site dev        # http://localhost:4173
SITE_API_BASE_URL=http://localhost:3000/api/v1 pnpm --filter @talent-x/site dev
```

`scripts/serve.mjs` reproduit les deux comportements de Nginx dont la page dépend — URL
sans extension (`/reset-password` → `reset-password.html`) et injection de `config.js` —
sans quoi les tests locaux ne prouveraient rien du réel.

Pour dérouler le parcours entier en local, pointer l'API dessus :
`APP_PUBLIC_URL=http://localhost:4173` (cf. `apps/api/.env.example`).

## Tests

```bash
pnpm --filter @talent-x/site test:e2e
```

Playwright, avec l'API simulée par interception réseau : la suite tourne en quelques
secondes, sans Docker, sans base et sans Expo. Elle couvre le jeton retiré de l'URL, la
charge utile réellement envoyée (`newPassword`, cf. contrat), le lien sans jeton, le jeton
invalide ou expiré (400), les saisies refusées côté page, l'API injoignable, et l'absence
de toute requête vers un tiers.

## Déploiement

Les fichiers de `public/` sont copiés sur le VPS à côté de `deploy/staging/` — le serveur
ne reçoit pas le dépôt. Procédure, certificat et pièges : `deploy/staging/README.md` (§6,
§8, §9, §12).
