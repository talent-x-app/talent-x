// Configuration Metro pour mono-repo pnpm (Expo SDK 52).
// Sans ceci, Metro ne surveille que ce dossier et ne résout pas les paquets de
// l'espace de travail (@talent-x/design-tokens, @talent-x/api-client), dont le
// code (dist/) vit à la racine du mono-repo.
// Réf : https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Surveille toute la racine du mono-repo (pour suivre les paquets @talent-x/*).
config.watchFolders = [workspaceRoot];

// Résout les modules depuis le paquet ET depuis la racine (hoisting pnpm).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
