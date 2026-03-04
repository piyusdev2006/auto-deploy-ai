/**
 * @file models/Deployment.js
 * @description Mongoose schema for individual deployment runs.
 *
 * A Deployment tracks the full lifecycle of a single deploy attempt:
 * from AI file generation → GitHub commit → Docker build → VPS deploy.
 */

const mongoose = require("mongoose");

/** Valid deployment status transitions: pending → generating → deploying → success | failed */
const DEPLOYMENT_STATUSES = [
  "pending",
  "generating",
  "deploying",
  "success",
  "failed",
];

const deploymentSchema = new mongoose.Schema(
  {
    /** Reference to the parent Project document. */
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "projectId is required"],
      index: true,
    },

    /** Current status of this deployment. */
    status: {
      type: String,
      enum: {
        values: DEPLOYMENT_STATUSES,
        message: "{VALUE} is not a valid deployment status",
      },
      default: "pending",
    },

    /** Ordered log lines emitted during the deployment pipeline. */
    logs: {
      type: [String],
      default: [],
    },

    /**
     * Raw AI-generated payload (Dockerfile content, docker-compose, workflow YAML).
     * Stored as a flexible JSON blob so agents can evolve the schema freely.
     */
    aiPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /** The live URL of the deployed application (populated on success). */
    deployedUrl: {
      type: String,
      default: "",
    },

    /** Git commit SHA of the devops-setup branch commit. */
    commitSha: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Deployment", deploymentSchema);
