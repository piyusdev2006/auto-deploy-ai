// User schema — GitHub OAuth user with AES-256-GCM encrypted access token.

const mongoose = require("mongoose");
const { encrypt, decrypt } = require("../utils/crypto");

const userSchema = new mongoose.Schema(
  {
    githubId: {
      type: String,
      required: [true, "githubId is required"],
      unique: true,
      index: true,
    },

    displayName: {
      type: String,
      default: "",
    },

    email: {
      type: String,
      default: "",
    },

    avatarUrl: {
      type: String,
      default: "",
    },

    // Stored encrypted — never log or return in API responses.
    githubAccessToken: {
      type: String,
      required: [true, "githubAccessToken is required"],
      select: false,
    },

    // Prevents double-encryption when re-saving a document with selected token.
    _tokenEncrypted: {
      type: Boolean,
      default: false,
      select: false,
    },
  },
  { timestamps: true },
);

userSchema.pre("save", function () {
  if (this.isModified("githubAccessToken") && !this._tokenEncrypted) {
    this.githubAccessToken = encrypt(this.githubAccessToken);
    this._tokenEncrypted = true;
  }
});

userSchema.methods.decryptToken = function () {
  return decrypt(this.githubAccessToken);
};

module.exports = mongoose.model("User", userSchema);
