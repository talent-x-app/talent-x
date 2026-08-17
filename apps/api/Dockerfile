# Image de l'API Talent-X — NestJS + Prisma (TX-DEPLOY-004 §3, §4.1).
#
# À construire depuis la RACINE du dépôt, pas depuis apps/api :
#   docker build -f apps/api/Dockerfile -t talentx-api:staging .
# pnpm a besoin de `pnpm-workspace.yaml` et du lockfile de la racine pour une
# installation déterministe.
#
# La MÊME image sert l'API, le worker et les migrations ; seule la commande
# change (cf. compose de staging). Un artefact unique par version évite la
# dérive entre des processus qui partagent la même base et le même schéma.

# Version EXACTE, alignée sur `engines.node: ">=22"` et sur le Node épinglé pour
# les builds EAS (22.11.0) : un seul runtime sur toute la chaîne de livraison.
# Node 20 est en fin de vie depuis avril 2026.
ARG NODE_VERSION=22.11.0

# ───────────────────────── Étape 1 — construction ─────────────────────────
FROM node:${NODE_VERSION}-slim AS builder

# Prisma exige OpenSSL, absent des images `slim`. Sans lui, `prisma generate`
# retient un moteur incompatible et l'erreur ne surgit qu'à la première requête.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Corepack est mis à jour AVANT d'être activé : celui embarqué dans Node 22.11.0
# échoue sur « Cannot find matching keyid » depuis que npm a fait tourner ses
# clés de signature. Le mettre à jour plutôt qu'installer pnpm en dur garde
# `packageManager` (racine) comme source unique de la version.
RUN npm install -g corepack@latest && corepack enable

WORKDIR /repo

# Manifestes d'abord : cette couche n'est invalidée que si les dépendances
# changent, pas à chaque modification de source.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/tsconfig/package.json packages/tsconfig/

# `--frozen-lockfile` : échoue si le lockfile ne correspond pas aux manifestes,
# plutôt que de résoudre silencieusement d'autres versions que la CI.
#
# Périmètre restreint à l'API. Contrairement au build mobile, elle ne dépend
# d'AUCUN paquet compilé de l'espace de travail : `@talent-x/tsconfig` n'est que
# du JSON, et `apps/api/src` n'importe aucun `@talent-x/*`. Rien à construire au
# préalable — vérifié, pas supposé.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @talent-x/api...

COPY packages/tsconfig/ packages/tsconfig/
COPY apps/api/ apps/api/

# `prisma generate && nest build` (script `build` de l'API).
RUN pnpm --filter @talent-x/api build

# ─────────────────────────── Étape 2 — exécution ───────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /repo

# Compromis assumé : on reprend l'arbre de dépendances de l'étape de
# construction plutôt que de réinstaller en `--prod`.
#
# Deux raisons, l'une de robustesse et l'autre de justesse :
#
#  1. Une installation `--prod` déclenche le script `prepare` de la racine, qui
#     lance `husky` — absent hors devDependencies : l'installation échoue.
#     Le contourner demanderait `--ignore-scripts`, qui neutraliserait du même
#     coup le postinstall de Prisma. On soigne le symptôme en cascade.
#  2. Le CLI `prisma` est une devDependency mais reste NÉCESSAIRE au runtime
#     pour `migrate deploy` (TX-DEPLOY-004 §5). Une image élaguée devrait le
#     réintroduire à la main, à la version exacte du lockfile.
#
# Le client Prisma est copié tel quel, et c'est correct ici : les deux étapes
# partagent la MÊME image de base, donc le moteur — spécifique à la plateforme —
# est le bon. Ce serait faux entre deux bases différentes.
#
# Coût : l'image embarque les devDependencies de l'API (~quelques centaines de
# Mo). Acceptable pour un staging ; à mesurer et réduire avant la production,
# où le temps de pull compte. Suivi à ouvrir, pas à improviser ici.
COPY --from=builder /repo/node_modules/ node_modules/
COPY --from=builder /repo/package.json /repo/pnpm-workspace.yaml /repo/.npmrc ./
COPY --from=builder /repo/apps/api/package.json apps/api/
COPY --from=builder /repo/apps/api/node_modules/ apps/api/node_modules/

# Schéma et migrations : indispensables à `migrate deploy`.
COPY --from=builder /repo/apps/api/prisma/ apps/api/prisma/
COPY --from=builder /repo/apps/api/dist/ apps/api/dist/

# L'image tourne sans privilèges. `node` existe déjà dans les images officielles.
USER node

# Documentaire : le port réel vient de PORT (défaut 3000, cf. main.ts).
EXPOSE 3000

# Défaut = l'API. Le worker et les migrations surchargent la commande dans le
# fichier de composition — un seul artefact, trois rôles.
CMD ["node", "apps/api/dist/main.js"]
