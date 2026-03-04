/**
 * @file routes/deployment.routes.js
 * @description Express router for deployment endpoints.
 *
 * Routes:
 *  POST /api/deploy   — trigger the full AI → GitHub → deploy pipeline
 *  GET  /api/deploy   — fetch the user's recent deployments
 */

const express = require("express");
const { ensureAuthenticated } = require("../middleware/auth.middleware");
const {
  triggerDeployment,
  getUserDeployments,
} = require("../controllers/deployment.controller");

const router = express.Router();

// POST /api/deploy — protected; user must be logged in via GitHub OAuth.
router.post("/", ensureAuthenticated, triggerDeployment);

// GET /api/deploy — protected; fetch the current user's deployment history.
router.get("/", ensureAuthenticated, getUserDeployments);

module.exports = router;
