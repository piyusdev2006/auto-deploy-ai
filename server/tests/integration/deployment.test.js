/**
 * @file tests/integration/deployment.test.js
 * @description Integration tests for POST /api/deploy.
 *
 * Strategy:
 *  - Mock `services/ai.service` and `services/github.service` so no real
 *    LLM or GitHub API calls are made.
 *  - Mock Mongoose models (User, Project, Deployment) so no database is needed.
 *  - Fake Passport authentication via a custom middleware injector.
 *  - Use Supertest to exercise the full HTTP request → controller → response.
 *
 * This tests the controller orchestration logic, input validation, error
 * handling, and HTTP status codes in isolation.
 */

// ── Mocks must be declared before any require() of the modules ──────────────

// Mock AI service
jest.mock("../../services/ai.service", () => ({
  generateInfrastructure: jest.fn(),
  generateCI: jest.fn(),
}));

// Mock GitHub service
jest.mock("../../services/github.service", () => ({
  fetchRepoContext: jest.fn(),
  commitInfrastructureFiles: jest.fn(),
}));

// Mock Mongoose models
jest.mock("../../models/User", () => {
  const findById = jest.fn();
  function UserModel() {}
  UserModel.findById = findById;
  UserModel.findOne = jest.fn();
  return UserModel;
});

jest.mock("../../models/Project", () => {
  const findOne = jest.fn();
  const create = jest.fn();
  function ProjectModel() {}
  ProjectModel.findOne = findOne;
  ProjectModel.create = create;
  return ProjectModel;
});

jest.mock("../../models/Deployment", () => {
  const create = jest.fn();
  function DeploymentModel() {}
  DeploymentModel.create = create;
  return DeploymentModel;
});

// ── Imports (receive mocked modules) ────────────────────────────────────────
const request = require("supertest");
const express = require("express");
const {
  generateInfrastructure,
  generateCI,
} = require("../../services/ai.service");
const {
  fetchRepoContext,
  commitInfrastructureFiles,
} = require("../../services/github.service");
const User = require("../../models/User");
const Project = require("../../models/Project");
const Deployment = require("../../models/Deployment");

// ── Build a test-only Express app with faked auth ───────────────────────────
// We can't use the real app.js because it initialises Passport with a real
// GitHub strategy. Instead we build a minimal app with the same route wiring
// and a middleware that fakes req.user + req.isAuthenticated.

const { ensureAuthenticated } = require("../../middleware/auth.middleware");
const {
  triggerDeployment,
} = require("../../controllers/deployment.controller");

/**
 * Create a fresh Express app with an optional fake user injected into
 * the request (simulating Passport session auth).
 */
const buildTestApp = (fakeUser = null) => {
  const app = express();
  app.use(express.json());

  // Fake auth middleware — sets req.user and req.isAuthenticated.
  app.use((req, _res, next) => {
    if (fakeUser) {
      req.user = fakeUser;
      req.isAuthenticated = () => true;
    } else {
      req.isAuthenticated = () => false;
    }
    next();
  });

  // Mount the deploy route exactly as app.js does.
  const router = express.Router();
  router.post("/", ensureAuthenticated, triggerDeployment);
  app.use("/api/deploy", router);

  return app;
};

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FAKE_USER = { _id: "user-id-123", githubId: "gh-999" };

const FAKE_DB_USER = {
  _id: "user-id-123",
  githubId: "gh-999",
  githubAccessToken: "encrypted:stuff:here",
  decryptToken: jest.fn().mockReturnValue("gho_plaintext"),
};

const FAKE_REPO_CONTEXT = "Repository: owner/repo\n📄 package.json\n{...}";

const FAKE_INFRA = {
  dockerfile: 'FROM node:20\nCOPY . .\nCMD ["node","index.js"]',
  dockerCompose: 'version: "3.8"\nservices:\n  web:\n    build: .',
};

const FAKE_CI_YAML = "name: Deploy\non:\n  push:\n    branches: [main]";

const FAKE_COMMIT = {
  commitSha: "abc123commit",
  branchName: "autodeploy-setup",
};

const FAKE_PROJECT = {
  _id: "project-id-456",
  userId: "user-id-123",
  repoUrl: "https://github.com/test-owner/test-repo",
  name: "test-repo",
};

const FAKE_DEPLOYMENT = {
  _id: "deploy-id-789",
  projectId: "project-id-456",
  status: "pending",
  commitSha: "abc123commit",
  aiPayload: {},
  logs: ["log1", "log2"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/deploy — Integration", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildTestApp(FAKE_USER);

    // ── Wire up the happy-path mock chain ────────────────────────────────
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(FAKE_DB_USER),
    });

    fetchRepoContext.mockResolvedValue(FAKE_REPO_CONTEXT);
    generateInfrastructure.mockResolvedValue(FAKE_INFRA);
    generateCI.mockResolvedValue(FAKE_CI_YAML);
    commitInfrastructureFiles.mockResolvedValue(FAKE_COMMIT);

    Project.findOne.mockResolvedValue(null); // no existing project
    Project.create.mockResolvedValue(FAKE_PROJECT);
    Deployment.create.mockResolvedValue(FAKE_DEPLOYMENT);
  });

  // ── Happy path ──────────────────────────────────────────────────────────
  test("should return 201 with deployment details on success", async () => {
    const res = await request(app)
      .post("/api/deploy")
      .send({ repoOwner: "test-owner", repoName: "test-repo" });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain("Deployment initiated");
    expect(res.body.deployment).toHaveProperty("_id");
    expect(res.body.deployment).toHaveProperty("commitSha", "abc123commit");
    expect(res.body.deployment).toHaveProperty(
      "branchName",
      "autodeploy-setup",
    );
    expect(res.body.deployment).toHaveProperty("status", "pending");
  });

  // ── Full pipeline orchestration ────────────────────────────────────────
  test("should call services in the correct order", async () => {
    await request(app)
      .post("/api/deploy")
      .send({ repoOwner: "test-owner", repoName: "test-repo" });

    // 1. Reload user with token
    expect(User.findById).toHaveBeenCalledWith("user-id-123");

    // 2. Fetch repo context
    expect(fetchRepoContext).toHaveBeenCalledWith(
      FAKE_DB_USER,
      "test-owner",
      "test-repo",
    );

    // 3. AI agents called with the context
    expect(generateInfrastructure).toHaveBeenCalledWith(FAKE_REPO_CONTEXT);
    expect(generateCI).toHaveBeenCalledWith(FAKE_REPO_CONTEXT);

    // 4. Files committed
    expect(commitInfrastructureFiles).toHaveBeenCalledWith(
      FAKE_DB_USER,
      "test-owner",
      "test-repo",
      {
        dockerfile: FAKE_INFRA.dockerfile,
        dockerCompose: FAKE_INFRA.dockerCompose,
        workflowYaml: FAKE_CI_YAML,
      },
    );

    // 5. Project created
    expect(Project.create).toHaveBeenCalled();

    // 6. Deployment created
    expect(Deployment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-id-456",
        status: "pending",
        commitSha: "abc123commit",
      }),
    );
  });

  // ── Existing project reuse ─────────────────────────────────────────────
  test("should reuse existing Project instead of creating a new one", async () => {
    Project.findOne.mockResolvedValue(FAKE_PROJECT); // project already exists

    await request(app)
      .post("/api/deploy")
      .send({ repoOwner: "test-owner", repoName: "test-repo" });

    expect(Project.findOne).toHaveBeenCalled();
    expect(Project.create).not.toHaveBeenCalled();
  });

  // ── Input validation ───────────────────────────────────────────────────
  test("should return 400 when repoOwner is missing", async () => {
    const res = await request(app)
      .post("/api/deploy")
      .send({ repoName: "test-repo" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("repoOwner");
  });

  test("should return 400 when repoName is missing", async () => {
    const res = await request(app)
      .post("/api/deploy")
      .send({ repoOwner: "test-owner" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("repoName");
  });

  test("should return 400 when body is empty", async () => {
    const res = await request(app).post("/api/deploy").send({});

    expect(res.status).toBe(400);
  });

  // ── Authentication ────────────────────────────────────────────────────
  test("should return 401 when user is not authenticated", async () => {
    const unauthApp = buildTestApp(null); // no fake user

    const res = await request(unauthApp)
      .post("/api/deploy")
      .send({ repoOwner: "test-owner", repoName: "test-repo" });

    expect(res.status).toBe(401);
  });

  // ── User not found in DB ──────────────────────────────────────────────
  test("should return 401 when user is not found in database", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const res = await request(app)
      .post("/api/deploy")
      .send({ repoOwner: "test-owner", repoName: "test-repo" });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("re-authenticate");
  });

  // ── GitHub 401 (revoked token) — PRD Edge Case 2 ──────────────────────
  test("should return 401 when GitHub token is revoked", async () => {
    const ghError = new Error("Bad credentials");
    ghError.status = 401;
    fetchRepoContext.mockRejectedValue(ghError);

    const res = await request(app)
      .post("/api/deploy")
      .send({ repoOwner: "test-owner", repoName: "test-repo" });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("revoked");
  });

  // ── AI service failure ────────────────────────────────────────────────
  test("should return 500 when AI service fails", async () => {
    generateInfrastructure.mockRejectedValue(new Error("LLM rate limited"));

    const res = await request(app)
      .post("/api/deploy")
      .send({ repoOwner: "test-owner", repoName: "test-repo" });

    expect(res.status).toBe(500);
  });

  // ── GitHub commit failure ─────────────────────────────────────────────
  test("should return 500 when GitHub commit fails", async () => {
    commitInfrastructureFiles.mockRejectedValue(
      new Error("GitHub API rate limit exceeded"),
    );

    const res = await request(app)
      .post("/api/deploy")
      .send({ repoOwner: "test-owner", repoName: "test-repo" });

    expect(res.status).toBe(500);
  });
});
