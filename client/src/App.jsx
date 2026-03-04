/**
 * @file src/App.jsx
 * @description Root application component — defines all client-side routes.
 *
 * Route structure:
 *  /login           → Public  (Login.jsx)
 *  /dashboard       → Protected (DashboardLayout → DashboardHome)
 *  /                → Redirects to /dashboard
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./views/Login";
import DashboardLayout from "./views/DashboardLayout";
import DashboardHome from "./views/DashboardHome";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Public routes ────────────────────────────────────────────── */}
          <Route path="/login" element={<Login />} />

          {/* ── Protected routes ─────────────────────────────────────────── */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardHome />} />
            </Route>
          </Route>

          {/* ── Catch-all → redirect to dashboard ────────────────────────── */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
