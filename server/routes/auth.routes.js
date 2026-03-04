/**
 * @file routes/auth.routes.js
 * @description Express router for GitHub OAuth authentication endpoints.
 *
 * Routes:
 *  GET /api/auth/github          → Redirect to GitHub login
 *  GET /api/auth/github/callback → Handle OAuth callback
 *  GET /api/auth/me              → Return current user (requires auth)
 *  GET /api/auth/logout          → Destroy session and log out
 */

const express = require("express");
const passport = require("passport");
const { ensureAuthenticated } = require("../middleware/auth.middleware");

const router = express.Router();

// ── Initiate GitHub OAuth ───────────────────────────────────────────────────────
router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email", "repo"] }),
);

// ── GitHub callback ─────────────────────────────────────────────────────────────
router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: `${process.env.CLIENT_URL || "http://localhost:5173"}/login?error=auth_failed`,
  }),
  (_req, res) => {
    // Successful authentication — redirect to frontend dashboard.
    res.redirect(
      `${process.env.CLIENT_URL || "http://localhost:5173"}/dashboard`,
    );
  },
);

// ── Get current authenticated user ──────────────────────────────────────────────
router.get("/me", ensureAuthenticated, (req, res) => {
  // Never send the encrypted token to the client.
  const { githubId, displayName, email, avatarUrl, _id } = req.user;
  res.json({ user: { _id, githubId, displayName, email, avatarUrl } });
});

// ── Logout ──────────────────────────────────────────────────────────────────────
router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.json({ message: "Logged out successfully." });
    });
  });
});

module.exports = router;
