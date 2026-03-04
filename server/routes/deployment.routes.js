// Deployment routes — trigger pipeline (POST) and list deployments (GET).

const express = require("express");
const { ensureAuthenticated } = require("../middleware/auth.middleware");
const {
  triggerDeployment,
  getUserDeployments,
} = require("../controllers/deployment.controller");

const router = express.Router();

router.post("/", ensureAuthenticated, triggerDeployment);
router.get("/", ensureAuthenticated, getUserDeployments);

module.exports = router;
