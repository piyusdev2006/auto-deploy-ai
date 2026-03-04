# Master Product Requirements Document (PRD): AutoDeploy AI

## 1. Product Overview
"AutoDeploy AI" is an autonomous, AI-native DevOps agency. It replaces human SREs with an AI swarm that containerizes, configures, and deploys client web applications to cloud servers. The system delivers a production-ready, monitored URL without human intervention.

## 2. The Tech Stack (Zero-Cost MERN + AI)
* **Frontend:** React.js (Vite), Tailwind CSS, shadcn/ui.
* **Backend:** Node.js, Express.js.
* **Database:** MongoDB Atlas (M0 Free Cluster) with Mongoose.
* **Authentication:** Passport.js (GitHub OAuth strategy).
* **AI Orchestration:** LangChain.js.
* **LLM Engine:** Gemini 1.5 Flash (via Google AI Studio) or Groq API.
* **CI/CD:** GitHub API (Octokit) & GitHub Actions.
* **Hosting:** Oracle Cloud "Always Free" Tier (ARM Ampere A1).
* **Containerization:** Docker & Docker Compose.

## 3. Core Architecture & Agent Swarm
The Node.js backend operates three specialized LangChain agents:
1. **The Architect Agent:** Ingests the client's repository structure, detects the framework, and generates an optimized `Dockerfile` and `docker-compose.yml`.
2. **The Pipeline Agent:** Writes the `.github/workflows/deploy.yml` to automate CI/CD on code pushes.
3. **The Operator Agent:** Connects securely to the Oracle VPS via SSH (`ssh2` package), pulls containers, and executes deployment.

## 4. User Workflow
1. User authenticates via GitHub OAuth on the frontend, granting repo access.
2. User selects a repository to deploy.
3. Express backend triggers Architect & Pipeline agents to generate infra files (JSON).
4. Express backend commits these files to a `devops-setup` branch via GitHub API.
5. GitHub Action fires, building and pushing the Docker image to the VPS.
6. React dashboard polls for status and displays the live URL.

## 5. Security & Secrets Management
* **Encryption:** GitHub OAuth access tokens must be encrypted in MongoDB using Node's native `crypto` module.
* **SSH Keys:** The Operator Agent's private key for the VPS must be loaded via `.env` and never exposed.
* **Validation:** All AI-generated files must pass basic syntax validation before being committed to GitHub.

## 6. Data Models
* **User:** `githubId` (String), `accessToken` (Encrypted String), `email` (String).
* **Project:** `userId` (Ref), `repoUrl` (String), `framework` (String), `vpsIp` (String).
* **Deployment:** `projectId` (Ref), `status` (Enum: pending, generating, deploying, success, failed), `logs` (Array of Strings), `aiPayload` (JSON).

## 7. Edge Cases & Error Handling
* **Edge Case 1 (AI Hallucination):** If the Architect Agent writes a malformed Dockerfile, the validation middleware must catch it, retry the LLM prompt once, and if it fails again, alert the user.
* **Edge Case 2 (Revoked Access):** If a user revokes GitHub permissions, the backend must cleanly catch the 401 Unauthorized error from Octokit and prompt the user to re-authenticate.
* **Edge Case 3 (VPS Timeout):** If the Operator Agent cannot SSH into the Oracle VPS within 30 seconds, the deployment marks as `failed` and logs "VPS Unreachable."