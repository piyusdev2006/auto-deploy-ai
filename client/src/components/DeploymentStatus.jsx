// Visual deployment tracker with pipeline status bar.

import {
  Clock,
  Cpu,
  Upload,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    label: "Pending",
    color: "text-text-muted",
    bg: "bg-text-muted/10",
    ring: "ring-text-muted/30",
    pulse: true,
  },
  generating: {
    icon: Cpu,
    label: "AI Generating",
    color: "text-brand-light",
    bg: "bg-brand/10",
    ring: "ring-brand/30",
    pulse: true,
  },
  deploying: {
    icon: Upload,
    label: "Deploying",
    color: "text-warning",
    bg: "bg-warning/10",
    ring: "ring-warning/30",
    pulse: true,
  },
  success: {
    icon: CheckCircle2,
    label: "Live",
    color: "text-success",
    bg: "bg-success/10",
    ring: "ring-success/30",
    pulse: false,
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    color: "text-danger",
    bg: "bg-danger/10",
    ring: "ring-danger/30",
    pulse: false,
  },
};

const PIPELINE_STEPS = ["pending", "generating", "deploying", "success"];

function getStepState(currentStatus, step) {
  if (currentStatus === "failed") {
    const failIdx = PIPELINE_STEPS.indexOf(currentStatus);
    const stepIdx = PIPELINE_STEPS.indexOf(step);
    // All steps before the current position are "done", current is "failed".
    if (stepIdx < failIdx) return "done";
    return step === currentStatus ? "failed" : "upcoming";
  }

  const currentIdx = PIPELINE_STEPS.indexOf(currentStatus);
  const stepIdx = PIPELINE_STEPS.indexOf(step);

  if (stepIdx < currentIdx) return "done";
  if (stepIdx === currentIdx) return "active";
  return "upcoming";
}

export default function DeploymentStatus({ deployment }) {
  const [logsOpen, setLogsOpen] = useState(false);

  const status = deployment.status || "pending";
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  const project = deployment.projectId;
  const projectName = project?.name || "Unknown";
  const timeAgo = formatTimeAgo(deployment.createdAt);

  return (
    <div className="rounded-xl border border-border bg-surface-card overflow-hidden transition-all hover:border-border/80">
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Status icon */}
          <div
            className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-lg ${config.bg} ring-1 ${config.ring}`}>
            <StatusIcon
              className={`w-5 h-5 ${config.color} ${config.pulse ? "animate-pulse" : ""}`}
            />
          </div>

          {/* Project name + status label */}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">
              {projectName}
            </p>
            <p className={`text-xs font-medium ${config.color}`}>
              {config.label}
              <span className="text-text-muted font-normal ml-2">
                {timeAgo}
              </span>
            </p>
          </div>
        </div>

        {/* Live URL (success only) */}
        {status === "success" && deployment.deployedUrl && (
          <a
            href={deployment.deployedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-1.5
                       text-xs font-medium bg-success/10 text-success hover:bg-success/20 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
            Live
          </a>
        )}
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-1">
          {PIPELINE_STEPS.map((step, idx) => {
            const state = getStepState(status, step);
            let barColor = "bg-border"; // upcoming
            if (state === "done") barColor = "bg-success";
            if (state === "active") barColor = "bg-brand animate-pulse";
            if (state === "failed") barColor = "bg-danger";

            return (
              <div
                key={step}
                className={`h-1.5 flex-1 rounded-full transition-colors ${barColor}`}
                title={STATUS_CONFIG[step]?.label || step}
              />
            );
          })}
        </div>
      </div>

      {deployment.logs?.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setLogsOpen(!logsOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5
                       text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
            <span>
              {deployment.logs.length} log
              {deployment.logs.length > 1 ? "s" : ""}
            </span>
            {logsOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {logsOpen && (
            <div className="px-4 pb-3 max-h-40 overflow-y-auto">
              <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap leading-relaxed">
                {deployment.logs.join("\n")}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
