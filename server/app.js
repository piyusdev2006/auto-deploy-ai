/**
 * @file app.js
 * @description Express application configuration.
 *
 * Separated from server.js so that Supertest can import the app directly
 * without binding to a port — a standard best practice for testability.
 */

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const configurePassport = require("./config/passport");

// ── Initialize Express ──────────────────────────────────────────────────────────
const app = express();

// ── Security headers ────────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS — allow the React frontend origin ──────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true, // allow cookies / session
  }),
);

// ── Body parsers ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Sessions (required by Passport for OAuth) ──────────────────────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // HTTPS only in prod
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  }),
);

// ── Passport ────────────────────────────────────────────────────────────────────
configurePassport(); // register GitHub strategy
app.use(passport.initialize());
app.use(passport.session());

// ── Health-check endpoint ───────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ──────────────────────────────────────────────────────────────────────
const authRoutes = require("./routes/auth.routes");
const deploymentRoutes = require("./routes/deployment.routes");
const webhookRoutes = require("./routes/webhook.routes");
const githubRoutes = require("./routes/github.routes");
app.use("/api/auth", authRoutes);
app.use("/api/deploy", deploymentRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/github", githubRoutes);

// ── 404 catch-all ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global error handler ────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[Error]", err.stack || err.message);
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

module.exports = app;
