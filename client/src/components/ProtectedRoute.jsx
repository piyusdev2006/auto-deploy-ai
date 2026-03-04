/**
 * @file src/components/ProtectedRoute.jsx
 * @description Route guard — redirects unauthenticated users to /login.
 *
 * While the initial session check is loading, a full-screen spinner is
 * shown to prevent content flash.
 */

import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
