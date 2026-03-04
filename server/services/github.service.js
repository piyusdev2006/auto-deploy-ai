// GitHub service — Octokit factory, repo context fetcher, and file committer.

const { Octokit } = require("@octokit/rest");

const getOctokit = (user) => {
  if (!user || typeof user.decryptToken !== "function") {
    throw new Error("Invalid user object — missing decryptToken method.");
  }

  const token = user.decryptToken();

  return new Octokit({ auth: token });
};

// Build a context string from repo tree + manifest for AI agents.
const fetchRepoContext = async (user, repoOwner, repoName) => {
  const octokit = getOctokit(user);

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

  let manifest = "";
  let manifestType = "";

  try {
    const { data: pkgJson } = await octokit.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path: "package.json",
    });

    manifest = Buffer.from(pkgJson.content, "base64").toString("utf-8");
    manifestType = "package.json";
  } catch {
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

// Commit AI-generated Dockerfile, docker-compose.yml, deploy.yml to autodeploy-setup branch.
const commitInfrastructureFiles = async (
  user,
  repoOwner,
  repoName,
  aiFiles,
) => {
  const octokit = getOctokit(user);
  const branchName = "autodeploy-setup";

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

  try {
    await octokit.git.createRef({
      owner: repoOwner,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
  } catch (err) {
    if (err.status === 422) {
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

  const treeItems = filesToCommit.map((file, index) => ({
    path: file.path,
    mode: "100644",
    type: "blob",
    sha: blobs[index].data.sha,
  }));

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

  const { data: newCommit } = await octokit.git.createCommit({
    owner: repoOwner,
    repo: repoName,
    message: "chore(autodeploy): add Dockerfile, docker-compose & CI workflow",
    tree: newTree.sha,
    parents: [baseSha],
  });

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

const getUserRepositories = async (user) => {
  const octokit = getOctokit(user);

  const { data: repos } = await octokit.repos.listForAuthenticatedUser({
    sort: "pushed",
    direction: "desc",
    per_page: 100,
    type: "all",
  });

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

module.exports = {
  getOctokit,
  fetchRepoContext,
  commitInfrastructureFiles,
  getUserRepositories,
};
