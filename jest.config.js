module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testMatch: [
      '**/__tests__/**/*.ts',
      '**/?(*.)+(spec|test).ts'
    ],
    transform: {
      '^.+\\.ts$': 'ts-jest',
    },
    collectCoverageFrom: [
      'src/**/*.ts',
      '!src/**/*.d.ts',
      '!src/main.ts',
      '!src/cli.ts',
      '!src/migrations/**',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
      'text',
      'lcov',
      'html'
    ],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    testTimeout: 30000,
    verbose: true,
  
    projects: [
      {
        displayName: 'unit',
        testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
        testEnvironment: 'node'
      },
      {
        displayName: 'integration',
        testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
        testEnvironment: 'node',
        setupFilesAfterEnv: ['<rootDir>/tests/integration-setup.ts']
      }
    ]
  };