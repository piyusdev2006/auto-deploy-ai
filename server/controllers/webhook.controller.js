/**
 * @file controllers/webhook.controller.js
 * @description Handles incoming GitHub webhook events.
 *
 * Security:
 *  - Validates the `x-hub-signature-256` HMAC header using WEBHOOK_SECRET
 *    before processing any payload. Rejects with 401 on mismatch.
 *
 * Supported events:
 *  - `workflow_run` with action `completed` and conclusion `success`
 *    → triggers the Operator Agent to deploy via SSH.
 */

const crypto = require("crypto");
const Deployment = require("../models/Deployment");
const Project = require("../models/Project");
const { executeRemoteDeployment } = require("../services/operator.service");

// ─────────────────────────────────────────────────────────────────────────────
// Signature Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the GitHub webhook HMAC-SHA256 signature.
 *
 * @param {string} payload    — raw request body as a string
 * @param {string} signature  — value of the x-hub-signature-256 header
 * @returns {boolean} true if the signature is valid
 */
const verifyWebhookSignature = (payload, signature) => {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("WEBHOOK_SECRET environment variable is not set.");
  }

  if (!signature) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload, "utf-8").digest("hex");

  // Constant-time comparison to prevent timing attacks.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    // Buffers of different lengths throw — treat as mismatch.
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/github
 *
 * GitHub sends this when a workflow_run event fires. We only act on
 * successful completions, triggering the Operator Agent for SSH deployment.
 */
const handleGitHubWebhook = async (req, res) => {
  try {
    // ── 1. Verify signature ───────────────────────────────────────────────
    const signature = req.headers["x-hub-signature-256"];
    const rawBody =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ error: "Invalid webhook signature." });
    }

    // ── 2. Parse the event ────────────────────────────────────────────────
    const event = req.headers["x-github-event"];
    const payload =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // We only care about workflow_run events.
    if (event !== "workflow_run") {
      return res.status(200).json({ message: `Ignored event: ${event}` });
    }

    const { action, workflow_run: workflowRun } = payload;

    // Only act on completed + successful runs.
    if (action !== "completed" || workflowRun?.conclusion !== "success") {
      return res.status(200).json({
        message: `Ignored workflow_run: action=${action}, conclusion=${workflowRun?.conclusion}`,
      });
    }

    // ── 3. Find the matching Deployment ───────────────────────────────────
    const repoFullName = payload.repository?.full_name; // "owner/repo"
    if (!repoFullName) {
      return res
        .status(400)
        .json({ error: "Missing repository info in payload." });
    }

    const repoUrl = `https://github.com/${repoFullName}`;

    // Find the project by repoUrl.
    const project = await Project.findOne({ repoUrl });
    if (!project) {
      return res.status(404).json({ error: `No project found for ${repoUrl}` });
    }

    // Find the most recent pending/generating deployment for this project.
    const deployment = await Deployment.findOne({
      projectId: project._id,
      status: { $in: ["pending", "generating"] },
    }).sort({ createdAt: -1 });

    if (!deployment) {
      return res
        .status(404)
        .json({ error: "No pending deployment found for this project." });
    }

    // ── 4. Update status → deploying ──────────────────────────────────────
    deployment.status = "deploying";
    deployment.logs.push(
      `[${new Date().toISOString()}] GitHub Action completed successfully. Starting SSH deployment.`,
    );
    await deployment.save();

    // ── 5. Execute SSH deployment via the Operator Agent ─────────────────
    try {
      const vpsIp = project.vpsIp || process.env.VPS_IP;

      if (!vpsIp) {
        throw new Error("No VPS IP configured for this project.");
      }

      const result = await executeRemoteDeployment(vpsIp, project.name);

      // ── 6a. Success ──────────────────────────────────────────────────
      deployment.status = "success";
      deployment.deployedUrl = `http://${vpsIp}`;
      deployment.logs.push(
        `[${new Date().toISOString()}] SSH deployment succeeded.`,
        `stdout: ${result.stdout}`,
      );
      await deployment.save();

      return res.status(200).json({
        message: "Deployment succeeded.",
        deploymentId: deployment._id,
        status: "success",
      });
    } catch (sshErr) {
      // ── 6b. SSH failure ──────────────────────────────────────────────
      deployment.status = "failed";
      deployment.logs.push(
        `[${new Date().toISOString()}] SSH deployment failed: ${sshErr.message}`,
      );
      await deployment.save();

      return res.status(200).json({
        message: "Deployment failed during SSH execution.",
        deploymentId: deployment._id,
        status: "failed",
        error: sshErr.message,
      });
    }
  } catch (err) {
    console.error(
      "[WebhookController] handleGitHubWebhook error:",
      err.message,
    );
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  handleGitHubWebhook,
  verifyWebhookSignature, // exported for testability
};
