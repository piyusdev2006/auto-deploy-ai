/**
 * @file utils/crypto.js
 * @description AES-256-GCM encryption / decryption utility for sensitive tokens.
 *
 * Uses Node's native `crypto` module — zero external dependencies.
 * The 32-byte encryption key is read from the ENCRYPTION_KEY env var.
 *
 * Why AES-256-GCM?
 *  - Authenticated encryption: guarantees both confidentiality AND integrity.
 *  - A unique IV is generated per encrypt call, preventing ciphertext repetition.
 *  - The 16-byte auth tag is stored alongside the ciphertext to detect tampering.
 */

const crypto = require("crypto");

// ── Constants ──────────────────────────────────────────────────────────────────
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Derive the 32-byte encryption key from the hex-encoded env variable.
 * Throws immediately if the key is missing or malformed so we fail fast
 * instead of silently producing garbage ciphertext.
 *
 * @returns {Buffer} 32-byte key buffer
 */
const getEncryptionKey = () => {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("ENCRYPTION_KEY environment variable is not set.");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be 32 bytes (64 hex chars). Got ${key.length} bytes.`,
    );
  }
  return key;
};

/**
 * Encrypt a plaintext string.
 *
 * Output format (hex):  iv:ciphertext:authTag
 * This lets us store a single string in MongoDB while keeping all three
 * components needed for decryption.
 *
 * @param {string} plaintext — the value to encrypt (e.g. a GitHub access token)
 * @returns {string} colon-separated hex string  iv:ciphertext:authTag
 */
const encrypt = (plaintext) => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${encrypted}:${authTag}`;
};

/**
 * Decrypt a previously encrypted string.
 *
 * @param {string} encryptedPayload — the iv:ciphertext:authTag string
 * @returns {string} original plaintext
 * @throws Will throw if the payload is tampered with or the key is wrong.
 */
const decrypt = (encryptedPayload) => {
  const key = getEncryptionKey();

  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted payload format. Expected iv:ciphertext:authTag",
    );
  }

  const [ivHex, ciphertext, authTagHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

module.exports = { encrypt, decrypt };
