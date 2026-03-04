// Landing page with GitHub OAuth login.

import { Github, Rocket, Shield, Zap } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";

const GITHUB_AUTH_URL = "/api/auth/github";

export default function Login() {
  const { isAuthenticated, loading } = useAuth();

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Brand */}
        <div className="space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand/10 mb-2">
            <Rocket className="w-8 h-8 text-brand" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-text-primary">
            AutoDeploy <span className="text-brand">AI</span>
          </h1>
          <p className="text-text-secondary text-lg leading-relaxed">
            Push code. We handle the rest. <br />
            AI-generated infrastructure, one-click deploys.
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex items-center justify-center gap-4 text-sm text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-warning" />
            AI-Powered
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-success" />
            Secure
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Github className="w-4 h-4" />
            GitHub Native
          </span>
        </div>

        {/* CTA button */}
        <a
          href={GITHUB_AUTH_URL}
          className="group inline-flex items-center justify-center gap-3 w-full px-6 py-3.5
                     bg-white text-gray-900 font-semibold rounded-xl
                     hover:bg-gray-100 transition-all duration-200
                     shadow-lg shadow-white/5 hover:shadow-white/10">
          <Github className="w-5 h-5 transition-transform group-hover:-translate-y-0.5" />
          Sign in with GitHub
        </a>

        {/* Legal */}
        <p className="text-xs text-text-muted">
          By signing in you agree to grant read-access to your repositories.
          <br />
          We never push code without your explicit approval.
        </p>
      </div>

      <footer className="absolute bottom-6 text-xs text-text-muted">
        Built with LangChain &middot; Docker &middot; GitHub Actions
      </footer>
    </div>
  );
}
