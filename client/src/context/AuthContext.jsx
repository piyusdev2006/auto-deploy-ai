/**
 * @file src/context/AuthContext.jsx
 * @description React Context for managing authentication state.
 *
 * On mount, this provider calls GET /api/auth/me to check if the user
 * has a valid session cookie from the GitHub OAuth flow.
 *
 * Exposes:
 *  - user       — the authenticated user object (or null)
 *  - loading    — true while the initial session check is in flight
 *  - isAuthenticated — convenience boolean
 *  - logout()   — calls the backend logout endpoint and clears state
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Check existing session on mount ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const { data } = await api.get("/auth/me");
        if (!cancelled) setUser(data.user);
      } catch {
        // 401 = no session → user stays null.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Logout handler ───────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await api.get("/auth/logout");
    } catch {
      // Even if the request fails, clear local state.
    }
    setUser(null);
    window.location.href = "/login";
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns {{ user: object|null, loading: boolean, isAuthenticated: boolean, logout: Function }}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
