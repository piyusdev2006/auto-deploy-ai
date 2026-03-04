/**
 * @file routes/webhook.routes.js
 * @description Express router for incoming GitHub webhook events.
 *
 * IMPORTANT: No Passport/session auth middleware here — GitHub calls this
 * endpoint directly. Security is handled via HMAC signature verification
 * inside the controller.
 */

const express = require("express");
const { handleGitHubWebhook } = require("../controllers/webhook.controller");

const router = express.Router();

// POST /api/webhooks/github — unauthenticated; verified by HMAC signature.
router.post("/github", handleGitHubWebhook);

module.exports = router;
