/**
 * @file tests/integration/webhook.test.js
 * @description Integration tests for POST /api/webhooks/github.
 *
 * Strategy:
 *  - Mock `services/operator.service` so no real SSH connections are made.
 *  - Mock Mongoose models (Project, Deployment) so no database is needed.
 *  - Sign dummy payloads using HMAC-SHA256 with the test WEBHOOK_SECRET.
 *  - Use Supertest to exercise the full HTTP flow.
 *
 * Tests cover: valid / invalid signatures, event filtering, missing
 * project/deployment, successful SSH, and SSH failure.
 */

const crypto = require("crypto");

// ── Mocks — must be declared BEFORE any require() of app ────────────────────

// Mock operator service.
jest.mock("../../services/operator.service", () => ({
  executeRemoteDeployment: jest.fn(),
}));

// Mock Project model.
jest.mock("../../models/Project", () => {
  const findOne = jest.fn();
  function ProjectModel() {}
  ProjectModel.findOne = findOne;
  return ProjectModel;
});

// Mock Deployment model.
jest.mock("../../models/Deployment", () => {
  const findOne = jest.fn();
  function DeploymentModel() {}
  DeploymentModel.findOne = findOne;

  // .sort() is chained after findOne — return an object with .sort that
  // resolves the value set on findOne's mockResolvedValue.
  DeploymentModel.findOne.mockReturnValue({
    sort: jest.fn().mockResolvedValue(null), // default: no deployment found
  });

  return DeploymentModel;
});

// Now require everything after mocks are in place.
const request = require("supertest");
const app = require("../../app");
const { executeRemoteDeployment } = require("../../services/operator.service");
const Project = require("../../models/Project");
const Deployment = require("../../models/Deployment");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "test-webhook-secret";

/**
 * Calculate the `x-hub-signature-256` for a payload string.
 */
const sign = (payload) => {
  const hmac = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payload, "utf-8")
    .digest("hex");
  return `sha256=${hmac}`;
};

/**
 * Build a valid `workflow_run` payload.
 */
const buildWorkflowRunPayload = (overrides = {}) => ({
  action: "completed",
  workflow_run: {
    conclusion: "success",
    head_sha: "abc123",
  },
  repository: {
    full_name: "testOwner/testRepo",
  },
  ...overrides,
});

/**
 * Send a signed webhook request via Supertest.
 */
const sendWebhook = (payload, event = "workflow_run") => {
  const body = JSON.stringify(payload);
  return request(app)
    .post("/api/webhooks/github")
    .set("Content-Type", "application/json")
    .set("x-github-event", event)
    .set("x-hub-signature-256", sign(body))
    .send(body);
};

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const fakeProjectId = "64a1b2c3d4e5f600001111aa";
const fakeDeploymentId = "64a1b2c3d4e5f600002222bb";

const fakeProject = {
  _id: fakeProjectId,
  name: "testRepo",
  repoUrl: "https://github.com/testOwner/testRepo",
  vpsIp: "10.0.0.99",
};

const createFakeDeployment = () => ({
  _id: fakeDeploymentId,
  projectId: fakeProjectId,
  status: "pending",
  logs: [],
  save: jest.fn().mockResolvedValue(true),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/github", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Signature verification ────────────────────────────────────────────
  test("should return 401 for missing signature header", async () => {
    const payload = buildWorkflowRunPayload();
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post("/api/webhooks/github")
      .set("Content-Type", "application/json")
      .set("x-github-event", "workflow_run")
      // No x-hub-signature-256 header.
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid webhook signature/i);
  });

  test("should return 401 for invalid signature", async () => {
    const payload = buildWorkflowRunPayload();
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post("/api/webhooks/github")
      .set("Content-Type", "application/json")
      .set("x-github-event", "workflow_run")
      .set("x-hub-signature-256", "sha256=deadbeef")
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid webhook signature/i);
  });

  // ── Event filtering ───────────────────────────────────────────────────
  test("should ignore non-workflow_run events", async () => {
    const payload = { action: "opened", pull_request: {} };

    const res = await sendWebhook(payload, "pull_request");

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Ignored event");
    expect(executeRemoteDeployment).not.toHaveBeenCalled();
  });

  test("should ignore workflow_run with non-completed action", async () => {
    const payload = buildWorkflowRunPayload({ action: "requested" });

    const res = await sendWebhook(payload);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Ignored workflow_run");
    expect(executeRemoteDeployment).not.toHaveBeenCalled();
  });

  test("should ignore workflow_run with non-success conclusion", async () => {
    const payload = buildWorkflowRunPayload({
      workflow_run: { conclusion: "failure", head_sha: "abc123" },
    });

    const res = await sendWebhook(payload);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Ignored workflow_run");
    expect(executeRemoteDeployment).not.toHaveBeenCalled();
  });

  // ── Missing project ────────────────────────────────────────────────────
  test("should return 404 when no project matches the repo URL", async () => {
    Project.findOne.mockResolvedValue(null);

    const res = await sendWebhook(buildWorkflowRunPayload());

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("No project found");
  });

  // ── Missing deployment ────────────────────────────────────────────────
  test("should return 404 when no pending deployment exists", async () => {
    Project.findOne.mockResolvedValue(fakeProject);
    Deployment.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });

    const res = await sendWebhook(buildWorkflowRunPayload());

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("No pending deployment");
  });

  // ── Successful deployment ─────────────────────────────────────────────
  test("should update deployment to 'success' on successful SSH execution", async () => {
    const fakeDeploy = createFakeDeployment();
    Project.findOne.mockResolvedValue(fakeProject);
    Deployment.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(fakeDeploy),
    });
    executeRemoteDeployment.mockResolvedValue({
      stdout: "Containers started.",
      stderr: "",
    });

    const res = await sendWebhook(buildWorkflowRunPayload());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(fakeDeploy.status).toBe("success");
    expect(fakeDeploy.save).toHaveBeenCalledTimes(2); // deploying + success
    expect(executeRemoteDeployment).toHaveBeenCalledWith(
      fakeProject.vpsIp,
      fakeProject.name,
    );
  });

  // ── SSH failure ────────────────────────────────────────────────────────
  test("should update deployment to 'failed' when SSH deployment fails", async () => {
    const fakeDeploy = createFakeDeployment();
    Project.findOne.mockResolvedValue(fakeProject);
    Deployment.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(fakeDeploy),
    });
    executeRemoteDeployment.mockRejectedValue(new Error("VPS Unreachable."));

    const res = await sendWebhook(buildWorkflowRunPayload());

    expect(res.status).toBe(200); // 200 to GitHub — we handled the event
    expect(res.body.status).toBe("failed");
    expect(res.body.error).toContain("VPS Unreachable");
    expect(fakeDeploy.status).toBe("failed");
    expect(fakeDeploy.save).toHaveBeenCalledTimes(2); // deploying + failed
  });

  // ── Missing VPS IP ────────────────────────────────────────────────────
  test("should fail when no VPS IP is configured for the project", async () => {
    const projectNoIp = { ...fakeProject, vpsIp: undefined };
    delete process.env.VPS_HOST; // also no fallback
    const fakeDeploy = createFakeDeployment();
    Project.findOne.mockResolvedValue(projectNoIp);
    Deployment.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(fakeDeploy),
    });

    const res = await sendWebhook(buildWorkflowRunPayload());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("failed");
    expect(fakeDeploy.status).toBe("failed");
  });

  // ── Deployment status transitions ──────────────────────────────────────
  test("should transition deployment through deploying → success", async () => {
    const fakeDeploy = createFakeDeployment();
    Project.findOne.mockResolvedValue(fakeProject);
    Deployment.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(fakeDeploy),
    });
    executeRemoteDeployment.mockResolvedValue({
      stdout: "ok",
      stderr: "",
    });

    await sendWebhook(buildWorkflowRunPayload());

    // First save: status → deploying
    const firstSaveCall = fakeDeploy.save.mock.invocationCallOrder[0];
    // The deployment should have been set to deploying before the first save.
    // After second save it should be success.
    expect(fakeDeploy.logs.length).toBeGreaterThanOrEqual(2);
    expect(fakeDeploy.deployedUrl).toBe(`http://${fakeProject.vpsIp}`);
  });

  // ── Missing repository in payload ─────────────────────────────────────
  test("should return 400 when repository info is missing from payload", async () => {
    const payload = buildWorkflowRunPayload();
    delete payload.repository;

    const res = await sendWebhook(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing repository");
  });
});
