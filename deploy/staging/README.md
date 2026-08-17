# Staging Talent-X — mise en service

Runbook de la première mise en service d'un VPS OVH nu jusqu'à une API joignable
en HTTPS. Cible : TX-DEPLOY-004 §2 (environnement « Staging ») et §4.1.

Les commandes préfixées `[local]` se lancent sur ton poste, les autres sur le VPS.

> **Ordre non négociable.** Le durcissement SSH (§2) doit précéder l'ouverture du
> pare-feu (§3), et le DNS (§5) doit précéder l'émission du certificat (§8) — une
> résolution publique est nécessaire au défi ACME.

---

## 1. Première connexion et mise à jour

OVH envoie une adresse IP et un accès `root` (mot de passe ou clé, selon l'option
retenue à la commande).

```bash
[local] ssh root@<IP_DU_VPS>
```

```bash
apt update && apt upgrade -y
cat /etc/os-release          # confirmer Debian 12 ou Ubuntu LTS
```

Un redémarrage est parfois demandé après la mise à jour du noyau (`reboot`).

---

## 2. Utilisateur non-root et durcissement SSH

Travailler en `root` au quotidien est à proscrire, et l'accès SSH par mot de
passe est la première porte que les robots essaient.

```bash
adduser talentx
usermod -aG sudo talentx
mkdir -p /home/talentx/.ssh && chmod 700 /home/talentx/.ssh
```

Depuis ton poste, dépose ta clé publique :

```bash
[local] ssh-copy-id talentx@<IP_DU_VPS>
```

> **Vérifie AVANT de couper quoi que ce soit.** Ouvre une **seconde** session
> `ssh talentx@<IP>` et confirme qu'elle fonctionne. Tant que cette session est
> ouverte, une erreur de configuration reste réparable.

```bash
sudo nano /etc/ssh/sshd_config
```

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

```bash
sudo systemctl restart ssh
```

---

## 3. Pare-feu

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH        # AVANT d'activer, sinon tu te verrouilles dehors
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Aucun autre port n'est ouvert : Postgres, Redis et MinIO ne sont joignables que
sur le réseau Docker interne, jamais depuis Internet.

---

## 4. Docker Engine

Le paquet `docker.io` des dépôts Debian est souvent ancien et sans le plugin
`compose` v2. On installe depuis le dépôt officiel.

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker talentx
```

Déconnecte-toi et reconnecte-toi pour que l'appartenance au groupe prenne effet.

```bash
docker compose version        # doit répondre sans sudo
```

> Sur Ubuntu, remplacer `debian` par `ubuntu` dans les deux URL.

---

## 5. Enregistrements DNS

**Deux** entrées, pas une. L'hôte de stockage est distinct parce que les archives
d'export RGPD sont livrées par URL présignée, dont la signature couvre l'hôte :
servir MinIO sous un sous-chemin de l'API casserait la vérification.

| Type | Nom               | Valeur    |
| ---- | ----------------- | --------- |
| `A`  | `staging-api`     | IP du VPS |
| `A`  | `staging-storage` | IP du VPS |

Vérifier la propagation avant d'aller plus loin :

```bash
dig +short staging-api.<domaine>
dig +short staging-storage.<domaine>
```

Les deux doivent renvoyer l'IP du VPS. Sans cela, l'étape 8 échouera.

---

## 6. Secrets

Décision assumée pour le staging (TX-SEC-003 §11) : un fichier protégé, hors
dépôt. **Ne vaut pas pour la production**, où un gestionnaire de secrets reste à
arrêter.

```bash
sudo mkdir -p /etc/talentx
sudo nano /etc/talentx/staging.env      # modèle : deploy/staging/staging.env.example
sudo chown root:root /etc/talentx/staging.env
sudo chmod 600 /etc/talentx/staging.env
```

La clé de signature RS256 se génère **sur ton poste** :

```bash
[local] pnpm --filter @talent-x/api keys:generate
```

> Ne jamais réutiliser la clé de production en staging : un jeton émis par l'un
> serait accepté par l'autre.

---

## 7. Récupérer la configuration de déploiement

```bash
sudo mkdir -p /opt/talentx && sudo chown talentx:talentx /opt/talentx
cd /opt/talentx
git clone <URL_DU_DEPOT> repo
cd repo/deploy/staging
```

Valider la composition **avant** de lancer quoi que ce soit :

```bash
docker compose config >/dev/null && echo "compose valide"
```

---

## 8. Certificat TLS — première émission

Poule et œuf : Nginx ne démarre pas son serveur TLS sans certificat, et le défi
ACME a besoin d'un serveur. On émet donc une première fois en mode `standalone`,
avant de démarrer la pile.

```bash
sudo docker run --rm -p 80:80 \
  -v talentx-staging_letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d staging-api.<domaine> -d staging-storage.<domaine> \
  --agree-tos -m <ton-email> --no-eff-email
```

Un seul certificat couvre les deux noms — c'est ce qu'attend la configuration
Nginx. Les renouvellements suivants sont automatiques (service `certbot`).

---

## 9. Premier démarrage

```bash
cd /opt/talentx/repo/deploy/staging
docker compose pull
docker compose up -d
docker compose ps
```

Le conteneur `migrate` doit apparaître en `exited (0)` : il applique les
migrations puis sort. L'API et le worker ne démarrent qu'après sa réussite.

```bash
docker compose logs migrate
docker compose logs api | tail -30
docker compose logs worker | tail -20
```

---

## 10. Vérifications

```bash
curl -s https://staging-api.<domaine>/api/v1/health          # {"status":"ok"}
curl -sI http://staging-api.<domaine> | head -1              # 301 vers HTTPS
```

Ce qu'il faut voir dans les journaux :

- `api` — `Nest application successfully started`, **sans** l'avertissement de clé
  RS256 éphémère (sa présence signifie que `JWT_PRIVATE_KEY` n'est pas prise en
  compte, et tous les jetons seraient invalidés à chaque redémarrage).
- `worker` — `Worker à l'écoute de la file « notifications »`, et la ligne
  `Push réel actif` si les credentials APNs/FCM sont renseignés.

Enfin, depuis l'app mobile : pointer `EXPO_PUBLIC_API_URL` sur
`https://staging-api.<domaine>/api/v1` et se connecter.

---

## Pièges connus

**Ne pas activer `ufw` avant d'avoir autorisé OpenSSH.** C'est le moyen le plus
rapide de perdre l'accès à un serveur distant.

**Le certificat couvre les deux noms d'hôte.** Émettre deux certificats séparés
demanderait de modifier la configuration Nginx, qui référence un seul chemin.

**`IMAGE_TAG` n'a pas de valeur par défaut**, volontairement. Un déploiement vise
un SHA de commit précis ; avec `latest`, un redémarrage changerait de version
sans décision explicite.

**`S3_ENDPOINT` est l'URL publique**, pas `http://minio:9000`. C'est elle qui est
signée dans les URL présignées : avec l'adresse interne, le lien de
téléchargement d'export est injoignable depuis un téléphone.
