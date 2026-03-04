/**
 * @file tests/services/github.service.test.js
 * @description Unit tests for the GitHub service layer.
 *
 * Strategy:
 *  - Octokit is fully mocked — zero real HTTP requests to GitHub.
 *  - We verify:
 *    • getOctokit creates an instance with the decrypted token.
 *    • fetchRepoContext assembles a coherent context string.
 *    • commitInfrastructureFiles follows the correct Git data flow
 *      (getRef → createRef → createBlob → createTree → createCommit → updateRef).
 */

// ── Mock Octokit BEFORE importing the service ──────────────────────────────────
const mockReposGet = jest.fn();
const mockReposGetContent = jest.fn();
const mockGitGetRef = jest.fn();
const mockGitCreateRef = jest.fn();
const mockGitUpdateRef = jest.fn();
const mockGitCreateBlob = jest.fn();
const mockGitGetCommit = jest.fn();
const mockGitCreateTree = jest.fn();
const mockGitCreateCommit = jest.fn();

jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      get: mockReposGet,
      getContent: mockReposGetContent,
    },
    git: {
      getRef: mockGitGetRef,
      createRef: mockGitCreateRef,
      updateRef: mockGitUpdateRef,
      createBlob: mockGitCreateBlob,
      getCommit: mockGitGetCommit,
      createTree: mockGitCreateTree,
      createCommit: mockGitCreateCommit,
    },
  })),
}));

const {
  getOctokit,
  fetchRepoContext,
  commitInfrastructureFiles,
} = require("../../services/github.service");

const { Octokit } = require("@octokit/rest");

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Fake user document that mimics a Mongoose doc with decryptToken(). */
const createMockUser = (token = "gho_fake_token_123") => ({
  _id: "user123",
  githubId: "12345",
  githubAccessToken: "encrypted:ciphertext:tag",
  decryptToken: jest.fn().mockReturnValue(token),
});

const REPO_OWNER = "test-owner";
const REPO_NAME = "test-repo";

const AI_FILES = {
  dockerfile:
    'FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "index.js"]',
  dockerCompose:
    'version: "3.8"\nservices:\n  web:\n    build: .\n    ports:\n      - "3000:3000"',
  workflowYaml: "name: Deploy\non:\n  push:\n    branches: [main]",
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests — getOctokit
// ─────────────────────────────────────────────────────────────────────────────

describe("GitHub Service — getOctokit", () => {
  beforeEach(() => jest.clearAllMocks());

  test("should create an Octokit instance with the decrypted token", () => {
    const user = createMockUser("gho_my_real_token");

    const octokit = getOctokit(user);

    expect(user.decryptToken).toHaveBeenCalledTimes(1);
    expect(Octokit).toHaveBeenCalledWith({ auth: "gho_my_real_token" });
    expect(octokit).toBeDefined();
    expect(octokit.repos).toBeDefined();
  });

  test("should throw on null / undefined user", () => {
    expect(() => getOctokit(null)).toThrow("Invalid user object");
    expect(() => getOctokit(undefined)).toThrow("Invalid user object");
  });

  test("should throw if user lacks decryptToken method", () => {
    expect(() => getOctokit({ _id: "123" })).toThrow("missing decryptToken");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — fetchRepoContext
// ─────────────────────────────────────────────────────────────────────────────

describe("GitHub Service — fetchRepoContext", () => {
  beforeEach(() => jest.clearAllMocks());

  test("should return a context string with directory listing and package.json", async () => {
    // Mock directory listing
    mockReposGetContent.mockResolvedValueOnce({
      data: [
        { name: "src", type: "dir" },
        { name: "package.json", type: "file" },
        { name: "README.md", type: "file" },
      ],
    });

    // Mock package.json content
    const pkgContent = JSON.stringify({
      name: "my-app",
      dependencies: { express: "^4.0.0" },
    });
    mockReposGetContent.mockResolvedValueOnce({
      data: {
        content: Buffer.from(pkgContent).toString("base64"),
        encoding: "base64",
      },
    });

    const user = createMockUser();
    const context = await fetchRepoContext(user, REPO_OWNER, REPO_NAME);

    expect(context).toContain(`${REPO_OWNER}/${REPO_NAME}`);
    expect(context).toContain("📁 src");
    expect(context).toContain("📄 package.json");
    expect(context).toContain("📄 README.md");
    expect(context).toContain("express");
    expect(context).toContain("package.json");
  });

  test("should fall back to requirements.txt for Python projects", async () => {
    // Mock directory listing
    mockReposGetContent.mockResolvedValueOnce({
      data: [
        { name: "app.py", type: "file" },
        { name: "requirements.txt", type: "file" },
      ],
    });

    // Mock package.json fetch — 404
    mockReposGetContent.mockRejectedValueOnce({ status: 404 });

    // Mock requirements.txt content
    mockReposGetContent.mockResolvedValueOnce({
      data: {
        content: Buffer.from("flask==2.3.0\ngunicorn==21.2.0").toString(
          "base64",
        ),
        encoding: "base64",
      },
    });

    const user = createMockUser();
    const context = await fetchRepoContext(user, REPO_OWNER, REPO_NAME);

    expect(context).toContain("requirements.txt");
    expect(context).toContain("flask");
  });

  test("should handle repos with no recognizable manifest", async () => {
    mockReposGetContent.mockResolvedValueOnce({
      data: [{ name: "main.go", type: "file" }],
    });

    // Both manifest fetches fail
    mockReposGetContent.mockRejectedValueOnce({ status: 404 });
    mockReposGetContent.mockRejectedValueOnce({ status: 404 });

    const user = createMockUser();
    const context = await fetchRepoContext(user, REPO_OWNER, REPO_NAME);

    expect(context).toContain("No package.json or requirements.txt found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — commitInfrastructureFiles
// ─────────────────────────────────────────────────────────────────────────────

describe("GitHub Service — commitInfrastructureFiles", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // ── Default happy-path mock chain ────────────────────────────────────
    // a. repos.get → default branch
    mockReposGet.mockResolvedValue({
      data: { default_branch: "main" },
    });

    // a. git.getRef → HEAD SHA
    mockGitGetRef.mockResolvedValue({
      data: { object: { sha: "abc123base" } },
    });

    // b. git.createRef → new branch (success)
    mockGitCreateRef.mockResolvedValue({ data: {} });

    // c. git.createBlob → one per file
    mockGitCreateBlob
      .mockResolvedValueOnce({ data: { sha: "blob-sha-1" } })
      .mockResolvedValueOnce({ data: { sha: "blob-sha-2" } })
      .mockResolvedValueOnce({ data: { sha: "blob-sha-3" } });

    // d. git.getCommit → base tree SHA
    mockGitGetCommit.mockResolvedValue({
      data: { tree: { sha: "base-tree-sha" } },
    });

    // d. git.createTree → new tree
    mockGitCreateTree.mockResolvedValue({
      data: { sha: "new-tree-sha" },
    });

    // e. git.createCommit → new commit
    mockGitCreateCommit.mockResolvedValue({
      data: { sha: "new-commit-sha-xyz" },
    });

    // f. git.updateRef
    mockGitUpdateRef.mockResolvedValue({ data: {} });
  });

  test("should commit files and return commitSha + branchName", async () => {
    const user = createMockUser();

    const result = await commitInfrastructureFiles(
      user,
      REPO_OWNER,
      REPO_NAME,
      AI_FILES,
    );

    expect(result).toEqual({
      commitSha: "new-commit-sha-xyz",
      branchName: "autodeploy-setup",
    });

    // Verify the full Git data flow was exercised.
    expect(mockReposGet).toHaveBeenCalledTimes(1);
    expect(mockGitGetRef).toHaveBeenCalledTimes(1);
    expect(mockGitCreateRef).toHaveBeenCalledTimes(1);
    expect(mockGitCreateBlob).toHaveBeenCalledTimes(3);
    expect(mockGitGetCommit).toHaveBeenCalledTimes(1);
    expect(mockGitCreateTree).toHaveBeenCalledTimes(1);
    expect(mockGitCreateCommit).toHaveBeenCalledTimes(1);
    expect(mockGitUpdateRef).toHaveBeenCalledTimes(1);
  });

  test("should create blobs for Dockerfile, docker-compose, and workflow", async () => {
    const user = createMockUser();
    await commitInfrastructureFiles(user, REPO_OWNER, REPO_NAME, AI_FILES);

    // Three blobs created — one for each file.
    expect(mockGitCreateBlob).toHaveBeenCalledTimes(3);

    // Verify the tree includes the right paths.
    const treeCall = mockGitCreateTree.mock.calls[0][0];
    const paths = treeCall.tree.map((item) => item.path);
    expect(paths).toContain("Dockerfile");
    expect(paths).toContain("docker-compose.yml");
    expect(paths).toContain(".github/workflows/deploy.yml");
  });

  test("should force-update branch if it already exists (422)", async () => {
    // Simulate branch already exists.
    const err = new Error("Reference already exists");
    err.status = 422;
    mockGitCreateRef.mockRejectedValueOnce(err);
    mockGitUpdateRef.mockResolvedValue({ data: {} });

    const user = createMockUser();
    const result = await commitInfrastructureFiles(
      user,
      REPO_OWNER,
      REPO_NAME,
      AI_FILES,
    );

    expect(result.commitSha).toBe("new-commit-sha-xyz");
    // updateRef called twice: once for the 422 fallback, once at the end.
    expect(mockGitUpdateRef).toHaveBeenCalled();
  });

  test("should re-throw unexpected errors from createRef", async () => {
    const err = new Error("Server error");
    err.status = 500;
    mockGitCreateRef.mockRejectedValueOnce(err);

    const user = createMockUser();
    await expect(
      commitInfrastructureFiles(user, REPO_OWNER, REPO_NAME, AI_FILES),
    ).rejects.toThrow("Server error");
  });

  test("should use the correct commit message", async () => {
    const user = createMockUser();
    await commitInfrastructureFiles(user, REPO_OWNER, REPO_NAME, AI_FILES);

    const commitCall = mockGitCreateCommit.mock.calls[0][0];
    expect(commitCall.message).toContain("autodeploy");
    expect(commitCall.parents).toEqual(["abc123base"]);
  });
});
