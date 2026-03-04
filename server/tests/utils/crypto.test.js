/**
 * @file tests/utils/crypto.test.js
 * @description Unit tests for the AES-256-GCM encryption / decryption utility.
 *
 * Covers:
 *  1. Round-trip: encrypt → decrypt returns the original plaintext.
 *  2. Ciphertext format: iv:ciphertext:authTag (three colon-separated hex parts).
 *  3. Each encrypt call produces a unique ciphertext (random IV).
 *  4. Tampered ciphertext is rejected (GCM integrity check).
 *  5. Missing ENCRYPTION_KEY throws a clear error.
 *  6. Malformed payload throws a clear error.
 */

const { encrypt, decrypt } = require("../../utils/crypto");

describe("Crypto Utility — AES-256-GCM", () => {
  const sampleToken = "gho_abc123XYZ_sample_github_access_token";

  // ── 1. Round-trip ──────────────────────────────────────────────────────────
  test("should encrypt and decrypt back to the original plaintext", () => {
    const encrypted = encrypt(sampleToken);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(sampleToken);
  });

  // ── 2. Ciphertext format ───────────────────────────────────────────────────
  test("should produce a colon-separated string with 3 hex parts", () => {
    const encrypted = encrypt(sampleToken);
    const parts = encrypted.split(":");

    expect(parts).toHaveLength(3);

    // Each part should be valid hex.
    parts.forEach((part) => {
      expect(part).toMatch(/^[0-9a-f]+$/i);
    });

    // IV = 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(32);
    // Auth tag = 16 bytes = 32 hex chars
    expect(parts[2]).toHaveLength(32);
  });

  // ── 3. Unique ciphertext per call (random IV) ─────────────────────────────
  test("should produce different ciphertext for the same plaintext", () => {
    const a = encrypt(sampleToken);
    const b = encrypt(sampleToken);
    expect(a).not.toBe(b);
  });

  // ── 4. Tamper detection ────────────────────────────────────────────────────
  test("should throw when ciphertext is tampered with", () => {
    const encrypted = encrypt(sampleToken);
    // Flip a character in the ciphertext portion.
    const parts = encrypted.split(":");
    parts[1] = parts[1].replace(/[0-9a-f]/, (c) => (c === "0" ? "1" : "0"));
    const tampered = parts.join(":");

    expect(() => decrypt(tampered)).toThrow();
  });

  // ── 5. Missing encryption key ─────────────────────────────────────────────
  test("should throw when ENCRYPTION_KEY is not set", () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;

    expect(() => encrypt(sampleToken)).toThrow(
      "ENCRYPTION_KEY environment variable is not set",
    );

    // Restore for subsequent tests.
    process.env.ENCRYPTION_KEY = original;
  });

  // ── 6. Malformed payload ───────────────────────────────────────────────────
  test("should throw on malformed encrypted payload", () => {
    expect(() => decrypt("not-a-valid-payload")).toThrow(
      "Invalid encrypted payload format",
    );
  });

  // ── 7. Empty string round-trip ─────────────────────────────────────────────
  test("should handle empty string encryption/decryption", () => {
    const encrypted = encrypt("");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  // ── 8. Long token round-trip ──────────────────────────────────────────────
  test("should handle a very long token", () => {
    const longToken = "x".repeat(10000);
    const encrypted = encrypt(longToken);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(longToken);
  });
});
