/**
 * @file config/passport.js
 * @description Passport.js configuration — GitHub OAuth 2.0 strategy.
 *
 * Flow:
 *  1. User clicks "Login with GitHub" on the React frontend.
 *  2. Passport redirects to GitHub's OAuth consent screen.
 *  3. GitHub redirects back with a temporary code.
 *  4. Passport exchanges the code for an access token.
 *  5. We find-or-create a User document and encrypt the token via the
 *     pre-save hook before it reaches MongoDB.
 */

const passport = require("passport");
const GitHubStrategy = require("passport-github2").Strategy;
const User = require("../models/User");

/**
 * Initialize the GitHub OAuth strategy on the provided passport instance.
 * Separated into a function so we can call it after env vars are loaded.
 */
const configurePassport = () => {
  // ── Serialize: store only the Mongo _id in the session ────────────────────
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // ── Deserialize: rehydrate the full User from the session id ──────────────
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });

  // ── GitHub Strategy ───────────────────────────────────────────────────────
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL,
        scope: ["user:email", "repo"], // repo scope needed to commit devops files
      },
      async (accessToken, _refreshToken, profile, done) => {
        try {
          // Look for an existing user by their GitHub ID.
          let user = await User.findOne({ githubId: profile.id }).select(
            "+githubAccessToken +_tokenEncrypted",
          );

          if (user) {
            // Update the access token (GitHub may rotate it).
            user.githubAccessToken = accessToken;
            user._tokenEncrypted = false; // mark as plaintext so pre-save re-encrypts
            user.displayName = profile.displayName || profile.username || "";
            user.avatarUrl = profile.photos?.[0]?.value || "";
            await user.save();
          } else {
            // First-time login — create a new user.
            user = await User.create({
              githubId: profile.id,
              displayName: profile.displayName || profile.username || "",
              email: profile.emails?.[0]?.value || "",
              avatarUrl: profile.photos?.[0]?.value || "",
              githubAccessToken: accessToken, // encrypted by pre-save hook
            });
          }

          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      },
    ),
  );
};

module.exports = configurePassport;
