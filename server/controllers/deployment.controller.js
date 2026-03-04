/**
 * @file controllers/deployment.controller.js
 * @description Orchestrates the full deployment pipeline.
 *
 * Flow:
 *  1. Validate request body (repoOwner, repoName).
 *  2. Reload the authenticated user with the encrypted token selected.
 *  3. Fetch the repo context from GitHub.
 *  4. Run the Architect and Pipeline AI agents in parallel.
 *  5. Commit the generated files to an `autodeploy-setup` branch.
 *  6. Find-or-create a Project document.
 *  7. Create a Deployment record (status: pending) with the AI payload.
 *  8. Return the deployment and commit details to the client.
 */

const User = require("../models/User");
const Project = require("../models/Project");
const Deployment = require("../models/Deployment");
const {
  generateInfrastructure,
  generateCI,
} = require("../services/ai.service");
const {
  fetchRepoContext,
  commitInfrastructureFiles,
} = require("../services/github.service");

/**
 * POST /api/deploy
 *
 * @body {string} repoOwner — GitHub username or organisation
 * @body {string} repoName  — repository name
 */
const triggerDeployment = async (req, res) => {
  try {
    // ── 1. Input validation ─────────────────────────────────────────────────
    const { repoOwner, repoName } = req.body;

    if (!repoOwner || !repoName) {
      return res.status(400).json({
        error: "repoOwner and repoName are required in the request body.",
      });
    }

    // ── 2. Reload user with encrypted token ─────────────────────────────────
    const user = await User.findById(req.user._id).select(
      "+githubAccessToken +_tokenEncrypted",
    );

    if (!user) {
      return res
        .status(401)
        .json({ error: "User not found. Please re-authenticate." });
    }

    // ── 3. Fetch repository context from GitHub ─────────────────────────────
    const repoContext = await fetchRepoContext(user, repoOwner, repoName);

    // ── 4. Run AI agents (Architect + Pipeline) in parallel ─────────────────
    const [infraResult, ciYaml] = await Promise.all([
      generateInfrastructure(repoContext),
      generateCI(repoContext),
    ]);

    // ── 5. Commit generated files to GitHub ─────────────────────────────────
    const aiFiles = {
      dockerfile: infraResult.dockerfile,
      dockerCompose: infraResult.dockerCompose,
      workflowYaml: ciYaml,
    };

    const { commitSha, branchName } = await commitInfrastructureFiles(
      user,
      repoOwner,
      repoName,
      aiFiles,
    );

    // ── 6. Find or create the Project document ──────────────────────────────
    const repoUrl = `https://github.com/${repoOwner}/${repoName}`;

    let project = await Project.findOne({ userId: user._id, repoUrl });
    if (!project) {
      project = await Project.create({
        userId: user._id,
        repoUrl,
        name: repoName,
      });
    }

    // ── 7. Create the Deployment record ─────────────────────────────────────
    const deployment = await Deployment.create({
      projectId: project._id,
      status: "pending",
      commitSha,
      aiPayload: aiFiles,
      logs: [
        `[${new Date().toISOString()}] AI infrastructure files generated.`,
        `[${new Date().toISOString()}] Files committed to branch "${branchName}" (${commitSha}).`,
      ],
    });

    // ── 8. Respond ──────────────────────────────────────────────────────────
    return res.status(201).json({
      message: "Deployment initiated successfully.",
      deployment: {
        _id: deployment._id,
        status: deployment.status,
        commitSha,
        branchName,
        repoUrl,
        logs: deployment.logs,
      },
    });
  } catch (err) {
    console.error("[DeployController] triggerDeployment error:", err.message);

    // Surface GitHub 401 specifically for revoked-access edge case (PRD §7).
    if (err.status === 401 || err.message?.includes("401")) {
      return res.status(401).json({
        error:
          "GitHub access denied. Your token may have been revoked — please re-authenticate.",
      });
    }

    return res.status(500).json({
      error:
        process.env.NODE_ENV === "production"
          ? "Deployment failed. Please try again."
          : err.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/deploy — List the authenticated user's deployments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all deployments belonging to the current user's projects.
 *
 * Flow:
 *  1. Find all Projects owned by this user.
 *  2. Find all Deployments linked to those Projects, sorted newest-first.
 *  3. Populate the parent Project's name, repoUrl, and vpsIp.
 */
const getUserDeployments = async (req, res) => {
  try {
    // Find all project IDs belonging to this user.
    const projects = await Project.find({ userId: req.user._id }).select("_id");
    const projectIds = projects.map((p) => p._id);

    // Fetch deployments for those projects, most recent first.
    const deployments = await Deployment.find({
      projectId: { $in: projectIds },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("projectId", "name repoUrl vpsIp");

    return res.status(200).json({ deployments });
  } catch (err) {
    console.error(
      "[DeploymentController] getUserDeployments error:",
      err.message,
    );
    return res.status(500).json({ error: err.message });
  }
};

module.exports = { triggerDeployment, getUserDeployments };
