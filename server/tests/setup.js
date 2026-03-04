/**
 * @file tests/setup.js
 * @description Global test setup — load env vars and set a deterministic
 * encryption key so crypto tests are reproducible.
 */

// Provide a valid 32-byte (64 hex char) encryption key for tests.
process.env.ENCRYPTION_KEY =
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
// Dummy GitHub OAuth credentials so passport-github2 doesn't throw on import.
process.env.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "test-client-id";
process.env.GITHUB_CLIENT_SECRET =
  process.env.GITHUB_CLIENT_SECRET || "test-client-secret";
process.env.GITHUB_CALLBACK_URL =
  process.env.GITHUB_CALLBACK_URL ||
  "http://localhost:5000/api/auth/github/callback";
// Dummy webhook secret for signature verification tests.
process.env.WEBHOOK_SECRET =
  process.env.WEBHOOK_SECRET || "test-webhook-secret";

// Dummy SSH key path for operator service tests (fs.readFileSync is mocked).
process.env.SSH_KEY_PATH = process.env.SSH_KEY_PATH || "./test-key.pem";
process.env.VPS_USERNAME = process.env.VPS_USERNAME || "ubuntu";

// Suppress noisy console output during tests.
process.env.NODE_ENV = "test";
