// Webhook route — no auth middleware; verified by HMAC signature.

const express = require("express");
const { handleGitHubWebhook } = require("../controllers/webhook.controller");

const router = express.Router();

router.post("/github", handleGitHubWebhook);

module.exports = router;
