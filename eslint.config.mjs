// Configuration ESLint (flat config, ESLint 9) — racine du mono-repo.
// Lint tout le dépôt en une passe : `pnpm lint`.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Artefacts et dépendances : jamais lintés.
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.expo/**',
      '**/*.config.js',
      // Specs & design : artefacts de référence (humains), pas du code applicatif.
      'docs/**',
      'design/**',
    ],
  },

  // Base JS pour tous les fichiers.
  js.configs.recommended,

  // Règles TypeScript (non type-aware : rapide et fiable cross-packages).
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    rules: {
      // Les paramètres/variables préfixés par _ sont volontairement inutilisés
      // (handlers stub, signatures de contrat).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Environnement Node par défaut (process, etc.) pour tout le code.
  {
    languageOptions: { globals: { ...globals.node } },
  },

  // Globals Jest dans les fichiers de test.
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    languageOptions: { globals: { ...globals.jest } },
  },

  // Désactive les règles en conflit avec Prettier (doit rester en dernier).
  prettier,
);
