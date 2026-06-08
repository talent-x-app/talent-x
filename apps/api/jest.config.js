/** @type {import('ts-jest').JestConfigWithTsJest} */
// Tests unitaires backend (TLX-015) : services, guards, utilitaires, validation.
// Les tests d'intégration/e2e (Supertest) ont leur propre config (test/jest-e2e.json)
// pour rester séparés et lançables indépendamment — cf. §6 de TX-OPS-004.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
};
