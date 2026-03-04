// Deployment controller — orchestrates AI → GitHub → deploy pipeline.

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

const triggerDeployment = async (req, res) => {
  try {
    const { repoOwner, repoName } = req.body;

    if (!repoOwner || !repoName) {
      return res.status(400).json({
        error: "repoOwner and repoName are required in the request body.",
      });
    }

    const user = await User.findById(req.user._id).select(
      "+githubAccessToken +_tokenEncrypted",
    );

    if (!user) {
      return res
        .status(401)
        .json({ error: "User not found. Please re-authenticate." });
    }

    const repoContext = await fetchRepoContext(user, repoOwner, repoName);

    const [infraResult, ciYaml] = await Promise.all([
      generateInfrastructure(repoContext),
      generateCI(repoContext),
    ]);

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

    const repoUrl = `https://github.com/${repoOwner}/${repoName}`;

    let project = await Project.findOne({ userId: user._id, repoUrl });
    if (!project) {
      project = await Project.create({
        userId: user._id,
        repoUrl,
        name: repoName,
      });
    }

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

const getUserDeployments = async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.user._id }).select("_id");
    const projectIds = projects.map((p) => p._id);

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
