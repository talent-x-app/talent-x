/** @type {import('jest').Config} */
// Harnais de tests unitaires mobile (TLX-015). Le preset `jest-expo` câble le
// transformer Babel, les mocks des modules natifs Expo/React Native et le runner
// multi-plateforme. `@testing-library/react-native` fournit le rendu + matchers.
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/react-native/extend-expect'],
  // Les paquets de l'espace de travail (@talent-x/*) sont publiés en JS compilé
  // (dist/) : on les exclut comme les modules natifs déjà gérés par le preset.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-router|expo-modules-core|@react-navigation/.*|react-native-.*))',
  ],
};
