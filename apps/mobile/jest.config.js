/** @type {import('jest').Config} */
// Harnais de tests unitaires mobile (TLX-015). Le preset `jest-expo` câble le
// transformer Babel, les mocks des modules natifs Expo/React Native et le runner
// multi-plateforme. `@testing-library/react-native` fournit le rendu + matchers.
module.exports = {
  preset: 'jest-expo',
  // Les specs Playwright (e2e/) ne sont pas des tests Jest : les ignorer.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
  // RNTL v13 : les matchers Jest sont auto-enregistrés à l'import du module
  // (plus de point d'entrée /extend-expect).
  // Les paquets de l'espace de travail (@talent-x/*) sont publiés en JS compilé
  // (dist/) : on les exclut comme les modules natifs déjà gérés par le preset.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-router|expo-modules-core|@react-navigation/.*|react-native-.*))',
  ],
  // Les suites d'écran (rendu RNTL + hydratation TanStack Query + mocks du client API)
  // dépassent régulièrement les 5 s par défaut **quand les workers Jest sont en concurrence**
  // pour le CPU — typiquement lorsque l'API Nest et Metro tournent à côté pendant une session
  // E2E. Symptôme : une dizaine de suites rouges sur « Exceeded timeout of 5000 ms », toutes
  // sur leur *premier* test, avec un ensemble **différent à chaque run** ; les mêmes passent
  // toutes en `--runInBand`. Ce n'est pas un masque : un test réellement bloqué échoue
  // toujours, simplement plus tard.
  testTimeout: 20_000,
  // Seuils de couverture « ratchet » (TLX-120) : posés juste sous la couverture
  // mesurée (89.9 / 83.1 / 87.0 / 90.6 au 2026-06-10) — anti-régression en CI ;
  // relever les seuils quand la couverture progresse.
  coverageThreshold: {
    global: { statements: 87, branches: 80, functions: 84, lines: 88 },
  },
};
