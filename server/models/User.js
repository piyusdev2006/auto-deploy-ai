/**
 * @file models/User.js
 * @description Mongoose schema for GitHub-authenticated users.
 *
 * Key security detail:
 *  - The `githubAccessToken` is transparently encrypted via a pre-save hook
 *    using our AES-256-GCM utility before it ever touches the database.
 *  - A `decryptToken()` instance method reconstitutes the plaintext only
 *    when the backend actually needs to call the GitHub API on behalf of
 *    the user.
 */

const mongoose = require("mongoose");
const { encrypt, decrypt } = require("../utils/crypto");

const userSchema = new mongoose.Schema(
  {
    /** GitHub numeric / string user ID — unique identifier from OAuth. */
    githubId: {
      type: String,
      required: [true, "githubId is required"],
      unique: true,
      index: true,
    },

    /** Display name from the GitHub profile. */
    displayName: {
      type: String,
      default: "",
    },

    /** Primary email from GitHub (may be null if the user hides it). */
    email: {
      type: String,
      default: "",
    },

    /** GitHub avatar URL — handy for the dashboard UI. */
    avatarUrl: {
      type: String,
      default: "",
    },

    /**
     * GitHub OAuth access token — stored **encrypted**.
     * Never log or return this value in API responses.
     */
    githubAccessToken: {
      type: String,
      required: [true, "githubAccessToken is required"],
      select: false, // excluded from queries by default
    },

    /**
     * Internal flag: when `true` the token field already contains ciphertext
     * and should NOT be re-encrypted on the next save.  This prevents the
     * double-encryption bug that crops up when you `.save()` a document that
     * was fetched with `+githubAccessToken`.
     */
    _tokenEncrypted: {
      type: Boolean,
      default: false,
      select: false,
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt
  },
);

// ── Pre-save hook: encrypt token ────────────────────────────────────────────────
userSchema.pre("save", function (next) {
  // Only encrypt if the token was modified AND is still plaintext.
  if (this.isModified("githubAccessToken") && !this._tokenEncrypted) {
    try {
      this.githubAccessToken = encrypt(this.githubAccessToken);
      this._tokenEncrypted = true;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

// ── Instance method: decrypt token ──────────────────────────────────────────────
/**
 * Decrypt the stored access token so we can use it with the GitHub API.
 *
 * @returns {string} plaintext GitHub access token
 */
userSchema.methods.decryptToken = function () {
  return decrypt(this.githubAccessToken);
};

module.exports = mongoose.model("User", userSchema);
