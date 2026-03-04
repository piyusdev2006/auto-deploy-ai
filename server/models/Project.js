/**
 * @file models/Project.js
 * @description Mongoose schema for a user's deployable project (GitHub repo).
 *
 * Each Project is linked to a User and represents one repository that the
 * user wants AutoDeploy AI to containerize and ship to the cloud.
 */

const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    /** Reference to the owning User document. */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },

    /** Full GitHub repository URL (e.g. https://github.com/user/repo). */
    repoUrl: {
      type: String,
      required: [true, "repoUrl is required"],
      trim: true,
    },

    /** Detected framework / runtime (e.g. "react", "express", "next"). */
    framework: {
      type: String,
      default: "unknown",
      trim: true,
      lowercase: true,
    },

    /** Oracle VPS public IP assigned to this project's deployment. */
    vpsIp: {
      type: String,
      default: "",
    },

    /** Human-readable project name (derived from repo name). */
    name: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Project", projectSchema);
