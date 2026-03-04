/**
 * @file tests/integration/app.test.js
 * @description Integration tests for the Express app using Supertest.
 *
 * These tests import the app directly (no running server) and exercise
 * HTTP endpoints without needing a database connection.
 *
 * Covers:
 *  1. Health-check endpoint returns 200 with expected shape.
 *  2. Unknown routes return 404.
 *  3. Auth /me endpoint returns 401 when not authenticated.
 *  4. Security headers are present (helmet).
 */

const request = require("supertest");
const app = require("../../app");

describe("Express App — Integration Tests", () => {
  // ── 1. Health check ────────────────────────────────────────────────────────
  describe("GET /api/health", () => {
    test('should return 200 with status "ok"', async () => {
      const res = await request(app).get("/api/health");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status", "ok");
      expect(res.body).toHaveProperty("environment");
      expect(res.body).toHaveProperty("timestamp");
    });

    test("should return valid ISO timestamp", async () => {
      const res = await request(app).get("/api/health");
      const parsed = new Date(res.body.timestamp);
      expect(parsed.toISOString()).toBe(res.body.timestamp);
    });
  });

  // ── 2. 404 catch-all ──────────────────────────────────────────────────────
  describe("Unknown routes", () => {
    test("should return 404 JSON for unknown GET routes", async () => {
      const res = await request(app).get("/api/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error", "Route not found");
    });

    test("should return 404 JSON for unknown POST routes", async () => {
      const res = await request(app).post("/api/foo").send({ bar: 1 });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error", "Route not found");
    });
  });

  // ── 3. Protected routes ───────────────────────────────────────────────────
  describe("GET /api/auth/me", () => {
    test("should return 401 when not authenticated", async () => {
      const res = await request(app).get("/api/auth/me");

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
    });
  });

  // ── 4. Security headers (helmet) ──────────────────────────────────────────
  describe("Security headers", () => {
    test("should include helmet security headers", async () => {
      const res = await request(app).get("/api/health");

      // Helmet sets several headers; check a few key ones.
      expect(res.headers).toHaveProperty("x-content-type-options", "nosniff");
      expect(res.headers).toHaveProperty("x-frame-options");
    });
  });
});
