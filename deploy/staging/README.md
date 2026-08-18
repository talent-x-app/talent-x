# Staging Talent-X — mise en service

Runbook de la première mise en service d'un VPS OVHcloud nu jusqu'à une API
joignable en HTTPS. Cible : TX-OPS-004 §2 (environnement « Staging ») et §4.1.

Convention : **`[PC]`** = sur le poste de travail (PowerShell), **`[VPS]`** = dans
la session SSH. Tout ce qui est entre `<chevrons>` est à remplacer.

> **Deux ordres non négociables.** La clé SSH doit être installée **et vérifiée**
> avant de couper l'authentification par mot de passe. Et le DNS doit résoudre
> avant d'émettre le certificat — Let's Encrypt valide en résolvant le nom
> publiquement.

---

## 1. Première connexion

OVHcloud **ne donne pas d'accès root**. Un utilisateur est créé au nom du système
choisi — `ubuntu` pour Ubuntu, `debian` pour Debian, `rocky` pour Rocky Linux —
et le mot de passe temporaire arrive par lien sécurisé dans le mail de livraison.

```powershell
[PC] ssh ubuntu@<IP_DU_VPS>
```

Un changement de mot de passe est imposé à la première connexion, puis la session
se ferme. Reconnecte-toi avec le nouveau.

```bash
[VPS] sudo apt update && sudo apt upgrade -y
[VPS] cat /etc/os-release
```

L'utilisateur par défaut a déjà les privilèges — à vérifier plutôt qu'à supposer,
car `groups` ne les montre pas : OVH les accorde par `/etc/sudoers.d/`.

```bash
[VPS] sudo -l -U ubuntu | tail -3      # attendu : (ALL) NOPASSWD: ALL
```

> Inutile de créer un autre utilisateur. Celui d'OVH a tout ce qu'il faut.

---

## 2. Clé SSH

L'ordre compte : **déposer, vérifier, puis seulement durcir.** L'inverse coûte
l'accès au serveur.

```powershell
[PC] Get-ChildItem $env:USERPROFILE\.ssh\*.pub
```

Si rien ne sort, générer — **avec un chemin explicite**, c'est la question à
laquelle on répond par défaut sans y penser :

```powershell
[PC] ssh-keygen -t ed25519 -C "talentx-staging" -f "$env:USERPROFILE\.ssh\talentx-staging-key"
```

Déposer la clé publique. `ssh-copy-id` **n'existe pas sur Windows** ; cette forme
en est l'équivalent, et évite le collage manuel — une clé publique tient sur une
seule ligne très longue, qu'un retour à la ligne parasite rend invalide :

```powershell
[PC] Get-Content $env:USERPROFILE\.ssh\talentx-staging-key.pub | ssh ubuntu@<IP_DU_VPS> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo DEPOSEE"
```

Déclarer un alias — un nom de clé non standard n'est **pas** essayé
automatiquement par SSH :

```powershell
[PC] Add-Content $env:USERPROFILE\.ssh\config @"

Host talentx-staging
    HostName <IP_DU_VPS>
    User ubuntu
    IdentityFile ~/.ssh/talentx-staging-key
    IdentitiesOnly yes
"@
```

Vérifier ce que SSH **applique**, et non ce que le fichier contient — `-G` résout
tout, y compris les blocs `Host` en double, où la première valeur l'emporte :

```powershell
[PC] ssh -G talentx-staging | Select-String "^hostname|^user|^identityfile"
[PC] ssh talentx-staging
```

La connexion doit passer sans mot de passe. Une passphrase de clé demandée n'est
pas la même chose.

---

## 3. Durcissement SSH

Sur Ubuntu, `/etc/ssh/sshd_config` **n'a pas le dernier mot** : il inclut
`/etc/ssh/sshd_config.d/*.conf` en tête, et sshd retient la **première** valeur
rencontrée. Les images cloud y déposent un `50-cloud-init.conf` portant
`PasswordAuthentication yes` — c'est lui qui commande.

Éditer le fichier principal n'aurait donc aucun effet, et supprimer le `50`
couperait l'accès documenté par OVH. On pose un fichier qui **trie avant**, et qui
survit à une réécriture de cloud-init :

```bash
[VPS] sudo tee /etc/ssh/sshd_config.d/10-talentx-hardening.conf > /dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
```

Contrôler **avant** de redémarrer — un fichier invalide empêcherait le service de
repartir, et la session en cours serait la dernière :

```bash
[VPS] sudo sshd -t && echo "syntaxe valide"
[VPS] sudo sshd -T | grep -i "^passwordauthentication\|^permitrootlogin"
[VPS] sudo systemctl restart ssh
```

Depuis un terminal **neuf**, sans fermer la session courante :

```powershell
[PC] ssh talentx-staging
```

---

## 4. Pare-feu

```bash
[VPS] sudo apt install -y ufw
[VPS] sudo ufw allow OpenSSH
[VPS] sudo ufw allow 80/tcp
[VPS] sudo ufw allow 443/tcp
[VPS] sudo ufw show added        # vérifier qu'OpenSSH y est AVANT d'activer
[VPS] sudo ufw enable
```

---

## 5. Docker Engine

Le paquet `docker.io` des dépôts Ubuntu est souvent ancien et **sans le plugin
`compose` v2**. On installe depuis le dépôt officiel.

```bash
[VPS] sudo apt install -y ca-certificates curl gnupg
[VPS] sudo install -m 0755 -d /etc/apt/keyrings
[VPS] curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
[VPS] sudo chmod a+r /etc/apt/keyrings/docker.gpg
[VPS] echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
[VPS] sudo apt update
[VPS] sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
[VPS] sudo usermod -aG docker ubuntu
```

Se déconnecter et se reconnecter — l'appartenance à un groupe n'est prise en
compte qu'à l'ouverture de session.

```bash
[VPS] docker compose version      # sans sudo
[VPS] docker run --rm hello-world
```

> Sur Debian, remplacer `ubuntu` par `debian` dans les deux URL.

---

## 6. Enregistrements DNS

**Deux** entrées. L'hôte de stockage est distinct parce que les archives d'export
RGPD sont livrées par URL présignée, dont la signature couvre l'hôte : servir
MinIO sous un sous-chemin de l'API casserait la vérification.

Créer les entrées **là où la zone est hébergée**, qui n'est pas forcément le
registrar :

```powershell
[PC] nslookup -type=NS <domaine>
```

| Type | Sous-domaine      | Cible       | TTL |
| ---- | ----------------- | ----------- | --- |
| `A`  | `staging-api`     | IPv4 du VPS | 300 |
| `A`  | `staging-storage` | IPv4 du VPS | 300 |

TTL à 300 pendant la mise en place : avec le défaut de 3600, une erreur d'adresse
se paie d'une heure d'attente.

```bash
[VPS] nslookup staging-api.<domaine>
[VPS] nslookup staging-storage.<domaine>
```

Tant que les deux ne renvoient pas l'IP, ne pas tenter le certificat — Let's
Encrypt limite temporairement les demandes après trop d'échecs.

---

## 7. Secrets

Décision assumée pour le staging (TX-SEC-003 §11) : un fichier protégé, hors
dépôt. **Ne vaut pas pour la production**, où l'outil reste à arrêter.

```bash
[VPS] sudo mkdir -p /etc/talentx
[VPS] sudo nano /etc/talentx/staging.env     # modèle : staging.env.example
[VPS] sudo chown root:root /etc/talentx/staging.env
[VPS] sudo chmod 600 /etc/talentx/staging.env
```

La clé de signature RS256 se génère sur le poste :

```powershell
[PC] pnpm --filter @talent-x/api keys:generate
```

> Ne jamais réutiliser la clé de production : un jeton émis par l'un serait
> accepté par l'autre.

---

## 8. Configuration de déploiement

Seuls les fichiers de `deploy/staging/` sont nécessaires — le code source n'a pas
sa place sur le serveur, l'image venant du registre.

```powershell
[PC] scp -r deploy/staging talentx-staging:/tmp/staging
```

```bash
[VPS] sudo mkdir -p /opt/talentx && sudo chown ubuntu:ubuntu /opt/talentx
[VPS] mv /tmp/staging /opt/talentx/
[VPS] cd /opt/talentx/staging
[VPS] docker compose config >/dev/null && echo "compose valide"
```

---

## 9. Certificat TLS

Poule et œuf : Nginx ne démarre pas son serveur TLS sans certificat, et le défi
ACME a besoin d'un serveur. On émet donc une première fois en `standalone`, avant
de lancer la pile. Les renouvellements suivants sont automatiques.

```bash
[VPS] sudo docker run --rm -p 80:80 \
  -v talentx-staging_letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d staging-api.<domaine> -d staging-storage.<domaine> \
  --agree-tos -m <email> --no-eff-email
```

Un seul certificat couvre les deux noms — c'est ce qu'attend la configuration
Nginx, qui référence un chemin unique.

---

## 10. Accès au registre

Le dépôt est privé, donc le paquet GHCR l'est aussi : sans authentification, le
`pull` répond `denied`. Attention, GHCR renvoie **le même `denied` quand l'image
n'existe pas** — vérifier d'abord que le job « Image API · publication GHCR » est
bien vert avant de suspecter les droits.

Créer un jeton sur `github.com/settings/tokens`, onglet **Tokens (classic)** —
les jetons _fine-grained_ ne fonctionnent pas avec GHCR. Portée **`read:packages`
uniquement** : le serveur n'a besoin que de télécharger.

```bash
[VPS] sudo docker login ghcr.io -u <login-github>
```

Le mot de passe demandé est le jeton. **`sudo` n'est pas optionnel** : Docker range
les identifiants dans le `~/.docker/config.json` de l'utilisateur qui exécute la
commande. Une connexion en tant qu'`ubuntu` suivie d'un `sudo docker compose pull`
ferait tirer l'image par `root`, sans identifiants — et le registre répondrait
`denied` comme si le jeton était mauvais.

`-u` attend le **login GitHub personnel**, pas le nom de l'organisation. En cas de
doute :

```bash
[VPS] curl -s -H "Authorization: Bearer <jeton>" https://api.github.com/user | grep '"login"'
```

---

## 11. Premier démarrage

`IMAGE_TAG` se lit dans le récapitulatif du job « Image API · publication GHCR ».
Toujours un SHA dont l'exécution est **verte** : un run échoué ne publie rien.

```bash
[VPS] cd /opt/talentx/staging
[VPS] sudo docker compose --env-file /etc/talentx/staging.env config >/dev/null && echo "compose valide"
[VPS] sudo docker compose --env-file /etc/talentx/staging.env pull
[VPS] sudo docker compose --env-file /etc/talentx/staging.env up -d
[VPS] sudo docker compose --env-file /etc/talentx/staging.env ps -a
```

`--env-file` sur **chaque** commande : `IMAGE_TAG` n'a pas de défaut, un oubli
échoue franchement plutôt que de démarrer une autre version.

`ps -a` et non `ps` : sans `-a`, les conteneurs éphémères (`migrate`, `minio-init`)
n'apparaissent pas puisqu'ils ont terminé — or c'est précisément leur code de
sortie qu'on veut lire.

Le conteneur `migrate` doit être en `Exited (0)` : il applique les migrations puis
sort, et l'API ne démarre qu'après sa réussite.

---

## 12. Vérifications

```bash
[VPS] curl -s https://staging-api.<domaine>/api/v1/health      # {"status":"ok"}
[VPS] docker compose logs api | tail -30
[VPS] docker compose logs worker | tail -20
```

Ce qu'il faut voir :

- `api` — `Nest application successfully started`, **sans** l'avertissement de clé
  RS256 éphémère. Sa présence signifierait que `JWT_PRIVATE_KEY` n'est pas prise
  en compte, et tous les jetons seraient invalidés à chaque redémarrage.
- `worker` — `Worker à l'écoute de la file « notifications »`, et `Push réel actif`
  si les credentials APNs/FCM sont renseignés.

Puis depuis l'app mobile : pointer `EXPO_PUBLIC_API_URL` sur
`https://staging-api.<domaine>/api/v1`.

---

## Pièges connus

**L'ordre lexical de `sshd_config.d/` décide.** La première valeur rencontrée
gagne, et `/etc/ssh/sshd_config` est lu en dernier. Un fichier de durcissement
doit trier **avant** `50-cloud-init.conf`, jamais après.

**`wc -l` ne dit pas si un fichier est vide.** Il compte les retours à la ligne :
une clé publique sans retour final donne `0` alors que le fichier est plein.
Utiliser `wc -c`.

**Ne pas activer `ufw` avant d'avoir autorisé OpenSSH.**

**Docker contourne `ufw`.** Il écrit ses propres règles iptables : un `ports:`
ajouté à un service serait exposé sur Internet malgré le pare-feu. La composition
n'en publie que sur `nginx` ; tous les autres services utilisent `expose:`.

**`S3_ENDPOINT` est l'URL publique**, pas `http://minio:9000` — c'est elle qui est
signée dans les URL présignées.

**`IMAGE_TAG` n'a pas de défaut**, volontairement.

**Compose n'interpole pas les variables dans `env_file`.** Un `${VAR:-défaut}` y
retombe toujours sur le défaut.

**`pnpm` n'existe pas dans l'image d'exécution.** Il ne sert qu'à la construction.
Pire, l'image de base officielle `node` pose un `ENTRYPOINT docker-entrypoint.sh`
qui **préfixe `node`** dès que le premier argument n'est pas un exécutable du PATH :
une commande commençant par `pnpm` devient `node pnpm …` et échoue sur
`Cannot find module '/repo/pnpm'`, message qui ne désigne pas sa cause. Toute
commande surchargée doit commencer par un exécutable réellement présent — d'où
l'appel direct au point d'entrée Node du CLI Prisma.

**Le mot de passe Postgres est écrit à deux endroits** : `POSTGRES_PASSWORD` et,
en clair, dans `DATABASE_URL`. Les désaccorder donne un Postgres parfaitement sain
et un `migrate` qui échoue à s'authentifier. Les caractères spéciaux (`@`, `/`,
`:`, `#`) doivent être encodés en pourcentage dans l'URL.

**Le volume `letsencrypt` est créé hors Compose** (§9, certbot en `standalone`).
Compose s'en plaint au démarrage — `volume ... was not created by Docker Compose` —
et l'utilise quand même. Avertissement attendu, pas une erreur.
