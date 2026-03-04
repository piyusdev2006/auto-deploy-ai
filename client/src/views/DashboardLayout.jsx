/**
 * @file src/views/DashboardLayout.jsx
 * @description Standard dashboard shell with top navigation bar and
 * a main content area rendered via a React Router <Outlet>.
 *
 * The navbar displays the user's GitHub avatar & display name, plus a
 * logout button. The main content area is where child routes render.
 */

import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Rocket, LogOut, LayoutDashboard } from "lucide-react";

export default function DashboardLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* ── Top navigation bar ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-surface-elevated/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
          {/* Left — brand */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand/10">
              <Rocket className="w-5 h-5 text-brand" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-text-primary">
              AutoDeploy <span className="text-brand">AI</span>
            </span>
          </div>

          {/* Center — navigation links (placeholder for future pages) */}
          <nav className="hidden md:flex items-center gap-1">
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg
                         text-text-primary bg-white/5 hover:bg-white/10 transition-colors">
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </a>
          </nav>

          {/* Right — user info + logout */}
          <div className="flex items-center gap-4">
            {/* Avatar & name */}
            <div className="flex items-center gap-3">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName || "User"}
                  className="w-8 h-8 rounded-full ring-2 ring-border"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-sm font-bold text-brand">
                  {user?.displayName?.[0]?.toUpperCase() || "U"}
                </div>
              )}
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-text-primary leading-none">
                  {user?.displayName || "User"}
                </p>
                {user?.email && (
                  <p className="text-xs text-text-muted mt-0.5">{user.email}</p>
                )}
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium
                         text-text-secondary rounded-lg hover:bg-white/5 hover:text-text-primary
                         transition-colors cursor-pointer"
              title="Sign out">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
