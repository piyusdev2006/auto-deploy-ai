// Repo card with "Deploy with AI" button.

import { Rocket, Lock, Globe, ExternalLink } from "lucide-react";

const LANG_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  PHP: "#4F5D95",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  Dart: "#00B4AB",
};

export default function RepoCard({ repo, onDeploy, deploying = false }) {
  return (
    <div className="group relative flex flex-col justify-between rounded-xl border border-border bg-surface-card p-5 transition-all hover:border-brand/40 hover:shadow-lg hover:shadow-brand/5">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-text-primary truncate">
            {repo.name}
          </h3>
          <span
            className={`inline-flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              repo.private
                ? "bg-warning/10 text-warning"
                : "bg-success/10 text-success"
            }`}>
            {repo.private ? (
              <Lock className="w-3 h-3" />
            ) : (
              <Globe className="w-3 h-3" />
            )}
            {repo.private ? "Private" : "Public"}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-text-secondary line-clamp-2 min-h-[2.5rem]">
          {repo.description || "No description provided."}
        </p>

        {/* Language badge */}
        {repo.language && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: LANG_COLORS[repo.language] || "#6b7280",
              }}
            />
            {repo.language}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => onDeploy(repo)}
          disabled={deploying}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5
                     text-sm font-semibold transition-all cursor-pointer
                     bg-brand text-white hover:bg-brand-hover
                     disabled:opacity-50 disabled:cursor-not-allowed">
          <Rocket className="w-4 h-4" />
          {deploying ? "Deploying…" : "Deploy with AI"}
        </button>

        <a
          href={repo.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg
                     text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
          title="View on GitHub">
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
