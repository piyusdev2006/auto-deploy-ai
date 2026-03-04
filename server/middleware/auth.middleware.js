// Auth guard — returns 401 if no active session.

const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res
    .status(401)
    .json({ error: "Unauthorized — please log in via GitHub." });
};

module.exports = { ensureAuthenticated };
