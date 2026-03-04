/**
 * @file services/github.service.js
 * @description GitHub API integration layer using Octokit.
 *
 * Provides three capabilities consumed by the deployment controller:
 *  1. getOctokit(user)        — authenticated Octokit instance via decrypted token
 *  2. fetchRepoContext(…)     — reads repo tree + package.json to build AI context
 *  3. commitInfrastructureFiles(…) — commits Dockerfile, docker-compose.yml, and
 *                                    deploy.yml to an `autodeploy-setup` branch
 *
 * All Octokit calls are wrapped in try/catch with meaningful error messages
 * so the controller can relay failures cleanly to the client.
 */

const { Octokit } = require("@octokit/rest");

// ─────────────────────────────────────────────────────────────────────────────
// 1. Authenticated Octokit Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an authenticated Octokit instance for the given user.
 *
 * The user document must have been fetched with `+githubAccessToken` so
 * the encrypted token is available for decryption.
 *
 * @param {import("mongoose").Document} user — User document with token selected
 * @returns {Octokit} authenticated Octokit instance
 */
const getOctokit = (user) => {
  if (!user || typeof user.decryptToken !== "function") {
    throw new Error("Invalid user object — missing decryptToken method.");
  }

  const token = user.decryptToken();

  return new Octokit({ auth: token });
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Repository Context Fetcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the repository's root tree and manifest file (package.json or
 * requirements.txt) to construct the repoContext string consumed by the
 * Architect and Pipeline agents.
 *
 * @param {import("mongoose").Document} user
 * @param {string} repoOwner — GitHub username or org
 * @param {string} repoName  — repository name
 * @returns {Promise<string>} human-readable repository context
 */
const fetchRepoContext = async (user, repoOwner, repoName) => {
  const octokit = getOctokit(user);

  // ── Fetch root directory listing ──────────────────────────────────────────
  const { data: repoContents } = await octokit.repos.getContent({
    owner: repoOwner,
    repo: repoName,
    path: "",
  });

  const fileTree = Array.isArray(repoContents)
    ? repoContents
        .map((item) => `${item.type === "dir" ? "📁" : "📄"} ${item.name}`)
        .join("\n")
    : "Unable to parse directory listing.";

  // ── Try to fetch package.json (Node/JS projects) ─────────────────────────
  let manifest = "";
  let manifestType = "";

  try {
    const { data: pkgJson } = await octokit.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path: "package.json",
    });

    // GitHub returns base64-encoded content for files.
    manifest = Buffer.from(pkgJson.content, "base64").toString("utf-8");
    manifestType = "package.json";
  } catch {
    // Not a Node project — try requirements.txt (Python).
    try {
      const { data: reqTxt } = await octokit.repos.getContent({
        owner: repoOwner,
        repo: repoName,
        path: "requirements.txt",
      });

      manifest = Buffer.from(reqTxt.content, "base64").toString("utf-8");
      manifestType = "requirements.txt";
    } catch {
      manifest = "No package.json or requirements.txt found.";
      manifestType = "unknown";
    }
  }

  // ── Build the context string ──────────────────────────────────────────────
  const context = [
    `Repository: ${repoOwner}/${repoName}`,
    "",
    "Root directory listing:",
    fileTree,
    "",
    `Manifest file (${manifestType}):`,
    manifest,
  ].join("\n");

  return context;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Infrastructure File Committer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commit AI-generated DevOps files to a new `autodeploy-setup` branch.
 *
 * Steps:
 *  a. Get the SHA of the default branch's HEAD.
 *  b. Create (or reset) the `autodeploy-setup` branch from that SHA.
 *  c. Build a new Git tree containing the three infra files.
 *  d. Create a commit pointing to the new tree.
 *  e. Update the branch ref to the new commit.
 *
 * @param {import("mongoose").Document} user
 * @param {string} repoOwner
 * @param {string} repoName
 * @param {object} aiFiles
 * @param {string} aiFiles.dockerfile     — Dockerfile content
 * @param {string} aiFiles.dockerCompose  — docker-compose.yml content
 * @param {string} aiFiles.workflowYaml   — .github/workflows/deploy.yml content
 * @returns {Promise<{ commitSha: string, branchName: string }>}
 */
const commitInfrastructureFiles = async (
  user,
  repoOwner,
  repoName,
  aiFiles,
) => {
  const octokit = getOctokit(user);
  const branchName = "autodeploy-setup";

  // ── a. Get default branch HEAD SHA ────────────────────────────────────────
  const { data: repo } = await octokit.repos.get({
    owner: repoOwner,
    repo: repoName,
  });
  const defaultBranch = repo.default_branch;

  const { data: refData } = await octokit.git.getRef({
    owner: repoOwner,
    repo: repoName,
    ref: `heads/${defaultBranch}`,
  });
  const baseSha = refData.object.sha;

  // ── b. Create or update the autodeploy-setup branch ───────────────────────
  try {
    // Try to create the branch.
    await octokit.git.createRef({
      owner: repoOwner,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
  } catch (err) {
    if (err.status === 422) {
      // Branch already exists — force update it to the latest default HEAD.
      await octokit.git.updateRef({
        owner: repoOwner,
        repo: repoName,
        ref: `heads/${branchName}`,
        sha: baseSha,
        force: true,
      });
    } else {
      throw err;
    }
  }

  // ── c. Create blobs for each file ─────────────────────────────────────────
  const filesToCommit = [
    { path: "Dockerfile", content: aiFiles.dockerfile },
    { path: "docker-compose.yml", content: aiFiles.dockerCompose },
    { path: ".github/workflows/deploy.yml", content: aiFiles.workflowYaml },
  ];

  const blobPromises = filesToCommit.map((file) =>
    octokit.git.createBlob({
      owner: repoOwner,
      repo: repoName,
      content: Buffer.from(file.content).toString("base64"),
      encoding: "base64",
    }),
  );
  const blobs = await Promise.all(blobPromises);

  // ── d. Create a new tree ──────────────────────────────────────────────────
  const treeItems = filesToCommit.map((file, index) => ({
    path: file.path,
    mode: "100644", // regular file
    type: "blob",
    sha: blobs[index].data.sha,
  }));

  // Get the current tree so we extend it (don't replace it).
  const { data: baseCommit } = await octokit.git.getCommit({
    owner: repoOwner,
    repo: repoName,
    commit_sha: baseSha,
  });

  const { data: newTree } = await octokit.git.createTree({
    owner: repoOwner,
    repo: repoName,
    base_tree: baseCommit.tree.sha,
    tree: treeItems,
  });

  // ── e. Create the commit ──────────────────────────────────────────────────
  const { data: newCommit } = await octokit.git.createCommit({
    owner: repoOwner,
    repo: repoName,
    message: "chore(autodeploy): add Dockerfile, docker-compose & CI workflow",
    tree: newTree.sha,
    parents: [baseSha],
  });

  // ── f. Point the branch at the new commit ─────────────────────────────────
  await octokit.git.updateRef({
    owner: repoOwner,
    repo: repoName,
    ref: `heads/${branchName}`,
    sha: newCommit.sha,
  });

  return {
    commitSha: newCommit.sha,
    branchName,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. User Repositories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the authenticated user's GitHub repositories.
 *
 * Returns both public and private repos, sorted by most recently pushed.
 * Paginates up to 100 repos (GitHub max per page).
 *
 * @param {import("mongoose").Document} user — User document with token selected
 * @returns {Promise<Array<{ name: string, full_name: string, description: string|null,
 *   language: string|null, private: boolean, html_url: string, updated_at: string }>>}
 */
const getUserRepositories = async (user) => {
  const octokit = getOctokit(user);

  const { data: repos } = await octokit.repos.listForAuthenticatedUser({
    sort: "pushed",
    direction: "desc",
    per_page: 100,
    type: "all", // public + private
  });

  // Return a lean payload — only the fields the frontend needs.
  return repos.map((repo) => ({
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description,
    language: repo.language,
    private: repo.private,
    html_url: repo.html_url,
    updated_at: repo.updated_at,
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  getOctokit,
  fetchRepoContext,
  commitInfrastructureFiles,
  getUserRepositories,
};
