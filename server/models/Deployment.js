// Deployment schema — tracks lifecycle from AI generation to VPS deploy.

const mongoose = require("mongoose");

const DEPLOYMENT_STATUSES = [
  "pending",
  "generating",
  "deploying",
  "success",
  "failed",
];

const deploymentSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "projectId is required"],
      index: true,
    },

    status: {
      type: String,
      enum: {
        values: DEPLOYMENT_STATUSES,
        message: "{VALUE} is not a valid deployment status",
      },
      default: "pending",
    },

    logs: {
      type: [String],
      default: [],
    },

    aiPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    deployedUrl: {
      type: String,
      default: "",
    },

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
