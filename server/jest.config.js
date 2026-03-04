/**
 * @file jest.config.js
 * @description Jest configuration for the AutoDeploy AI backend.
 */

module.exports = {
  // Use the default Node test environment (no DOM).
  testEnvironment: "node",

  // Look for test files in the tests/ directory.
  roots: ["<rootDir>/tests"],

  // Match *.test.js files.
  testMatch: ["**/*.test.js"],

  // Allow Jest/Babel to transform ESM-only packages (@octokit/*).
  // By default Jest ignores all of node_modules — we carve out @octokit.
  transformIgnorePatterns: [
    "node_modules/(?!(@octokit|before-after-hook|universal-user-agent)/)",
  ],

  // Collect coverage from source files (exclude config/tests).
  collectCoverageFrom: [
    "utils/**/*.js",
    "models/**/*.js",
    "routes/**/*.js",
    "middleware/**/*.js",
    "services/**/*.js",
    "!**/node_modules/**",
  ],

  // Generous timeout for integration tests that may hit the network.
  testTimeout: 10000,

  // Run setup file before each test suite.
  setupFiles: ["<rootDir>/tests/setup.js"],
};
