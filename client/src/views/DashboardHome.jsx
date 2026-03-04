// Dashboard home — repo list + deployment status with polling.

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { getRepos, getDeployments, triggerDeploy } from "../lib/api";
import RepoCard from "../components/RepoCard";
import DeploymentStatus from "../components/DeploymentStatus";
import { Loader2, Search, Inbox, AlertCircle } from "lucide-react";

const POLL_INTERVAL = 5_000;

export default function DashboardHome() {
  const { user } = useAuth();

  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [reposError, setReposError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [deployments, setDeployments] = useState([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);

  // Track which repos are currently being deployed.
  const [deployingRepos, setDeployingRepos] = useState(new Set());

  useEffect(() => {
    let cancelled = false;

    const fetchRepos = async () => {
      try {
        const data = await getRepos();
        if (!cancelled) setRepos(data);
      } catch (err) {
        if (!cancelled) setReposError(err.response?.data?.error || err.message);
      } finally {
        if (!cancelled) setReposLoading(false);
      }
    };

    fetchRepos();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchDeploymentsRef = useRef(null);

  const fetchDeploymentsFn = useCallback(async () => {
    try {
      const data = await getDeployments();
      setDeployments(data);
    } catch {
    } finally {
      setDeploymentsLoading(false);
    }
  }, []);

  fetchDeploymentsRef.current = fetchDeploymentsFn;

  useEffect(() => {
    fetchDeploymentsRef.current();

    const id = setInterval(() => {
      fetchDeploymentsRef.current();
    }, POLL_INTERVAL);

    return () => clearInterval(id);
  }, []);

  const handleDeploy = useCallback(async (repo) => {
    setDeployingRepos((prev) => new Set(prev).add(repo.full_name));

    try {
      await triggerDeploy(repo.html_url, repo.name);
      fetchDeploymentsRef.current();
    } catch (err) {
      console.error("Deploy failed:", err);
      alert(
        err.response?.data?.error || "Deployment failed. Please try again.",
      );
    } finally {
      setDeployingRepos((prev) => {
        const next = new Set(prev);
        next.delete(repo.full_name);
        return next;
      });
    }
  }, []);

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Welcome back, {user?.displayName || "Developer"}
        </h1>
        <p className="text-text-secondary mt-1">
          Select a repository and deploy with AI in one click.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Repositories
            </h2>

            {/* Search */}
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search repos…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-elevated pl-9 pr-3 py-2
                           text-sm text-text-primary placeholder:text-text-muted
                           focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand
                           transition-colors"
              />
            </div>
          </div>

          {/* Loading */}
          {reposLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
            </div>
          )}

          {/* Error */}
          {reposError && (
            <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
              <AlertCircle className="w-5 h-5 text-danger shrink-0" />
              <p className="text-sm text-danger">{reposError}</p>
            </div>
          )}

          {/* Repo grid */}
          {!reposLoading && !reposError && (
            <>
              {filteredRepos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Inbox className="w-10 h-10 text-text-muted mb-3" />
                  <p className="text-sm text-text-muted">
                    {searchQuery
                      ? "No repositories match your search."
                      : "No repositories found."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredRepos.map((repo) => (
                    <RepoCard
                      key={repo.full_name}
                      repo={repo}
                      onDeploy={handleDeploy}
                      deploying={deployingRepos.has(repo.full_name)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Deployments
          </h2>

          {/* Loading */}
          {deploymentsLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
            </div>
          )}

          {/* Empty state */}
          {!deploymentsLoading && deployments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-border bg-surface-card">
              <Inbox className="w-10 h-10 text-text-muted mb-3" />
              <p className="text-sm text-text-muted">
                No deployments yet. Deploy a repo to get started.
              </p>
            </div>
          )}

          {/* Deployment list */}
          {!deploymentsLoading && deployments.length > 0 && (
            <div className="space-y-3">
              {deployments.map((d) => (
                <DeploymentStatus key={d._id} deployment={d} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
