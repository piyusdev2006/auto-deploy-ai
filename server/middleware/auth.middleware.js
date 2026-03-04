/**
 * @file middleware/auth.middleware.js
 * @description Express middleware helpers for authentication guards.
 */

/**
 * Ensures the request is from an authenticated (session-based) user.
 * Returns 401 if no active session exists.
 */
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res
    .status(401)
    .json({ error: "Unauthorized — please log in via GitHub." });
};

module.exports = { ensureAuthenticated };
