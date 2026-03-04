/**
 * @file routes/github.routes.js
 * @description Express router for GitHub-related data endpoints.
 *
 * Routes:
 *  GET /api/github/repos — fetch the authenticated user's GitHub repos
 */

const express = require("express");
const { ensureAuthenticated } = require("../middleware/auth.middleware");
const User = require("../models/User");
const { getUserRepositories } = require("../services/github.service");

const router = express.Router();

/**
 * GET /api/github/repos
 *
 * Returns the user's GitHub repositories (public + private),
 * sorted by most recently pushed.
 */
router.get("/repos", ensureAuthenticated, async (req, res) => {
  try {
    // Reload user with the encrypted token selected.
    const user = await User.findById(req.user._id).select("+githubAccessToken");
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const repos = await getUserRepositories(user);
    return res.status(200).json({ repos });
  } catch (err) {
    console.error("[GitHubRoutes] /repos error:", err.message);

    // GitHub 401 = token revoked.
    if (err.status === 401 || err.response?.status === 401) {
      return res.status(401).json({
        error: "GitHub token revoked — please re-authenticate.",
      });
    }

    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
