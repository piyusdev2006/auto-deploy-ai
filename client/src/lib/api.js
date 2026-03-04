// Pre-configured Axios instance + API helpers.

import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Redirect to login on 401.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export const getRepos = () =>
  api.get("/github/repos").then((r) => r.data.repos);

export const getDeployments = () =>
  api.get("/deploy").then((r) => r.data.deployments);

export const triggerDeploy = (repoUrl, repoName) => {
  const parts = repoUrl.replace("https://github.com/", "").split("/");
  const repoOwner = parts[0];
  const name = parts[1] || repoName;

  return api.post("/deploy", { repoOwner, repoName: name }).then((r) => r.data);
};

export default api;
