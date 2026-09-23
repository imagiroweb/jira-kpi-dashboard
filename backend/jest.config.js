/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Périmètre métier : logique / API / utilitaires testables.
  // Hors scope : scripts, clients infra lourds (Jira/Monday/…), barrels index.ts,
  // et WorklogApplicationService (orchestration massive déjà couverte ciblée en phaseD).
  collectCoverageFrom: [
    'src/domain/**/*.ts',
    'src/application/**/*.ts',
    'src/routes/**/*.ts',
    'src/middleware/**/*.ts',
    'src/utils/**/*.ts',
    'src/services/**/*.ts',
    'src/websocket/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/index.ts',
    '!src/application/services/WorklogApplicationService.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 70,
      functions: 80,
    },
  },
  verbose: true,
};
