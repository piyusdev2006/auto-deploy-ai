// Project schema — links a User to a GitHub repo for deployment.

const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },

    repoUrl: {
      type: String,
      required: [true, "repoUrl is required"],
      trim: true,
    },

    framework: {
      type: String,
      default: "unknown",
      trim: true,
      lowercase: true,
    },

    vpsIp: {
      type: String,
      default: "",
    },

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
