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
  // Seuils de couverture « ratchet » (TLX-120, TX-OPS-004 §6) : posés juste sous la
  // couverture mesurée (92.2 / 77.4 / 85.8 / 92.7 au 2026-06-10) — toute régression
  // significative casse la CI ; relever les seuils quand la couverture progresse.
  coverageThreshold: {
    global: { statements: 90, branches: 75, functions: 83, lines: 90 },
  },
};
