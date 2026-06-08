/** @type {import('ts-jest').JestConfigWithTsJest} */
// Tests unitaires du mutator du client API (TLX-008). Le code généré (orval)
// n'est pas testé : c'est de la génération déterministe couverte par le typecheck.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
};
