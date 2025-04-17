// jest.config.js
module.exports = {
  // Tell Jest to use the Node environment
  testEnvironment: 'node',

  // File patterns for tests to match
  testMatch: [
    "**/tests/**/*.test.js",
    "**/tests/**/*.spec.js"
  ],

  // Ignore specific directories
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/"
  ],

  // Global setup script to run once before all test suites
  globalSetup: './tests/globalSetup.js',

  // Setup files to run before each test file
  setupFilesAfterEnv: ['./tests/setup.js'],

  // Set the test environment to 'test' (Note: cross-env in script is usually preferred)
  // globals: {
  //   'NODE_ENV': 'test' // This might be redundant if using cross-env
  // },

  // Set timeout to 10 seconds
  testTimeout: 10000,

  // Verbose output provides more test details
  verbose: true,

  // Show detailed coverage information
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/*.js',
    '!**/node_modules/**'
  ],
  coverageReporters: ['text', 'lcov'],

  // Enforce coverage minimums
  coverageThreshold: {
    global: {
      branches: 54,
      functions: 78,
      lines: 75,
      statements: 75
    }
  },
};