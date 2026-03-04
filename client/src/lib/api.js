/**
 * @file src/lib/api.js
 * @description Pre-configured Axios instance + API helper methods.
 *
 * Key configuration:
 *  - `withCredentials: true` — sends the HTTP-only session cookie on
 *    every request so authentication works seamlessly.
 *  - `baseURL` points to the Vite dev-server proxy (`/api`), which
 *    forwards to the Express backend at localhost:5000.
 */

import axios from "axios";

const api = axios.create({
  baseURL: "/api", // Vite proxy rewrites this to http://localhost:5000/api
  withCredentials: true, // Send session cookie on every request
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Response interceptor ────────────────────────────────────────────────────
// Redirect to login on 401 (expired / missing session).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect if we're not already on the login page.
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

// ── API Helpers ─────────────────────────────────────────────────────────────

/** Fetch the authenticated user's GitHub repositories. */
export const getRepos = () =>
  api.get("/github/repos").then((r) => r.data.repos);

/** Fetch the user's recent deployments. */
export const getDeployments = () =>
  api.get("/deploy").then((r) => r.data.deployments);

/**
 * Trigger a new AI deployment for the given repository.
 *
 * @param {string} repoUrl   — full GitHub URL (https://github.com/owner/repo)
 * @param {string} repoName  — repository name (e.g. "my-app")
 */
export const triggerDeploy = (repoUrl, repoName) => {
  // Extract owner/name from the URL.
  const parts = repoUrl.replace("https://github.com/", "").split("/");
  const repoOwner = parts[0];
  const name = parts[1] || repoName;

  return api.post("/deploy", { repoOwner, repoName: name }).then((r) => r.data);
};

export default api;
