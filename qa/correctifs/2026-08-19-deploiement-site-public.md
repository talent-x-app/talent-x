# Déploiement du lot 1 + site public — 2026-08-19

`main` est à **`3608921`** et poussé : les quatre correctifs de la campagne y sont
(TLX-232, TLX-231, TLX-233, TLX-234). Le staging tourne encore l'image précédente, qui
n'en contient aucun. Ce document est le **prompt à coller dans une session d'exploitation**.

> **La création de l'enregistrement DNS n'est faisable par personne d'autre que toi** :
> elle se fait dans l'interface de l'hébergeur de la zone. Tout le reste est automatisable.

---

## Prompt

Tu déploies sur le staging Talent-X le lot de correctifs issu de la campagne de
qualification, dont **TLX-234** qui introduit un **site public statique** (ADR-57).

**Le runbook fait autorité : lis `deploy/staging/README.md` en entier avant d'agir.** Il
a été mis à jour pour ce déploiement et contient les pièges, notamment §§ site public,
certificat et vérifications. Ne réinvente pas la procédure, applique-la.

### Contexte

- VPS accessible par `ssh talentx-staging` (`92.222.71.37`), pile dans
  `/opt/talentx/staging`, secrets dans `/etc/talentx/staging.env` (`root:root`, `600`).
- Hôtes déjà servis : `staging-api.talent-x.app`, `staging-storage.talent-x.app`.
- Hôte à ajouter : **`staging.talent-x.app`** — le site public.
- Image à déployer : **`IMAGE_TAG=sha-360892142e4970f6f5548ee5d3ca4566a39963e7`**
  (run #257, vert). Un run échoué ou annulé ne publie rien, et GHCR renvoie le même
  `denied` pour une image absente que pour un droit manquant — d'où l'importance de partir
  d'un run **vert**.

  > Le run précédent (#256, commit `47bec37`) apparaît **annulé** : deux poussées
  > rapprochées se sont succédé et la concurrence GitHub Actions a interrompu la première
  > au profit de la seconde. Ce n'est pas un échec de build. `3608921` contient tout
  > `47bec37` — c'est le même code plus un fichier de documentation — donc l'image du run
  > #257 est complète.

### L'ordre compte — trois contraintes non négociables

1. **Le DNS d'abord.** `staging.talent-x.app` doit résoudre vers l'IP du VPS **avant**
   toute demande de certificat : Let's Encrypt valide en résolvant le nom publiquement, et
   limite temporairement les demandes après trop d'échecs. Vérifie la résolution depuis le
   VPS, pas seulement depuis ton poste.
2. **`certbot --expand`**, jamais un `certonly` nu. Sans lui, certbot crée un lignage
   séparé (`-0001`) que la configuration Nginx ne référence pas : le site répondrait avec
   le certificat de l'API et le navigateur afficherait une erreur de nom.
3. **Copier les fichiers du site.** Le VPS ne reçoit jamais le dépôt, seulement
   `deploy/staging/`. Les fichiers d'`apps/site/public` doivent être copiés à part, dans le
   `./site` que monte le compose (procédure exacte dans le runbook). Piège majeur :
   `docker compose config` ne dit **rien** d'un `./site` absent — Docker crée
   silencieusement un dossier vide et Nginx sert des 404. La seule vérification qui compte
   est d'ouvrir `/reset-password`.

### Trois variables à porter dans `/etc/talentx/staging.env`

Modèle commenté : `deploy/staging/staging.env.example`. Sauvegarde le fichier avant de
l'éditer.

| Variable         | Valeur                         | Pourquoi ça compte                                                                                                                                            |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_HOST`      | `staging.talent-x.app`         | déclarée `${SITE_HOST:?}` dans le compose — **la pile refuse de démarrer sans elle**                                                                          |
| `APP_PUBLIC_URL` | `https://staging.talent-x.app` | **à corriger** : elle vaut aujourd'hui l'hôte de l'API. C'est le cœur du défaut TLX-234 — le lien de l'email pointait sur une adresse qui ne sert aucune page |
| `CORS_ORIGINS`   | `https://staging.talent-x.app` | le site appelle l'API depuis sa propre origine ; sans cette ligne l'échec n'est visible que dans la console du navigateur                                     |

⚠️ **`CORS_ORIGINS` restreint l'accès.** Le staging est aujourd'hui permissif (le code ne
verrouille qu'en `production`). Dès que la variable est renseignée, seules les origines
listées passent : si un client web de développement tape ce staging depuis une autre
origine, il cassera. Ajoute-la à la liste si ce cas existe, sinon note la conséquence.

Ne touche à **aucune** des variables de throttling introduites par TLX-233 : elles ont
toutes des défauts sûrs (actif d'office en staging, 300 req/60 s en global, 10/15 min sur
les routes sensibles, un saut de proxy de confiance). Rien à ajouter.

### Déploiement

`--env-file` sur **chaque** commande (`IMAGE_TAG` n'a pas de défaut, un oubli déploierait
une autre version), puis `pull` et **`up -d`** — surtout pas `restart`, qui rejoue le
conteneur avec l'environnement figé à son démarrage et ignorerait tes nouvelles variables.
`ps -a` et non `ps` : `migrate` et `minio-init` sont éphémères et c'est leur code de sortie
qu'on veut lire (`Exited (0)`).

### Vérifications à rendre

- `https://staging.talent-x.app/reset-password` → **200** (un 404 = `./site` absent ou mal
  monté, cf. piège 3) ;
- certificat servi sur le site : le **même** lignage que l'API, sans erreur de nom ;
- `https://staging-api.talent-x.app/api/v1/health` → 200 ; **premier** appel à `/ready`
  après démarrage → **200** (c'est le correctif TLX-232 : il renvoyait 503 auparavant) ;
- logs worker : `Push réel actif` **et** `Email réel actif — Brevo` ;
- logs API : pas d'avertissement de clé RS256 éphémère.

### Ce que tu ne fais pas

Ne lance aucun scénario de qualification et ne bascule aucun ticket en Done : c'est la
session de campagne qui rejoue QA-08.1, QA-01.2 et QA-01.4/01.5 contre le staging
redéployé, et c'est ce rejeu qui clôt les défauts — pas le déploiement.

Rends un compte rendu qui dise : ce qui a été changé sur le serveur, ce que chaque
vérification a donné, et tout ce qui t'a surpris en chemin.
