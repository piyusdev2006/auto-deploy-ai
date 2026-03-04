/**
 * @file services/operator.service.js
 * @description The Operator Agent — executes remote Docker deployments via SSH.
 *
 * Connects to an AWS EC2 instance (or any Linux host) using the `ssh2`
 * library, runs `docker compose pull && docker compose up -d` inside the
 * project directory, and returns stdout/stderr as structured logs.
 *
 * SSH key handling:
 *  - Reads the `.pem` key file from disk via `fs.readFileSync` to avoid
 *    multiline-string issues in `.env` files (enterprise standard for AWS).
 *  - Key path is configured via the `SSH_KEY_PATH` env var.
 *
 * PRD Edge Case 3: If the SSH connection cannot be established within 30
 * seconds, the promise rejects with "VPS Unreachable."
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("ssh2");

// SSH connection timeout — 30 seconds per PRD §7, Edge Case 3.
const SSH_CONNECT_TIMEOUT_MS = 30_000;

/**
 * Execute the Docker deployment on a remote VPS via SSH.
 *
 * @param {string} vpsIp        — public IP of the target VPS
 * @param {string} projectName  — directory name under /opt/ on the VPS
 * @returns {Promise<{ stdout: string, stderr: string }>}
 *          Resolves with command output on success.
 * @throws {Error} Rejects with error message on connection failure,
 *                 command failure, or timeout.
 */
const executeRemoteDeployment = (vpsIp, projectName) => {
  return new Promise((resolve, reject) => {
    // ── Validate inputs ───────────────────────────────────────────────────
    if (!vpsIp || typeof vpsIp !== "string") {
      return reject(new Error("vpsIp must be a non-empty string."));
    }
    if (!projectName || typeof projectName !== "string") {
      return reject(new Error("projectName must be a non-empty string."));
    }

    // ── Read the SSH private key from disk ─────────────────────────────
    const keyPath = process.env.SSH_KEY_PATH;
    if (!keyPath) {
      return reject(new Error("SSH_KEY_PATH environment variable is not set."));
    }

    let privateKey;
    try {
      privateKey = fs.readFileSync(path.resolve(keyPath));
    } catch (err) {
      return reject(
        new Error(
          `Failed to read SSH key file at "${keyPath}": ${err.message}`,
        ),
      );
    }

    const sshUser = process.env.VPS_USERNAME || "ubuntu";

    const conn = new Client();

    // Accumulate output buffers.
    let stdout = "";
    let stderr = "";

    // ── Connection timeout handler ──────────────────────────────────────
    const timeoutId = setTimeout(() => {
      conn.end();
      reject(new Error("VPS Unreachable."));
    }, SSH_CONNECT_TIMEOUT_MS);

    // ── SSH event handlers ──────────────────────────────────────────────
    conn.on("ready", () => {
      clearTimeout(timeoutId);

      // Build the deployment command chain.
      const command = [
        `cd /opt/${projectName}`,
        "docker compose pull",
        "docker compose up -d",
      ].join(" && ");

      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(new Error(`SSH exec error: ${err.message}`));
        }

        stream.on("data", (data) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        stream.on("close", (code) => {
          conn.end();

          if (code !== 0) {
            return reject(
              new Error(
                `Deployment command exited with code ${code}. stderr: ${stderr}`,
              ),
            );
          }

          resolve({ stdout, stderr });
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`SSH connection error: ${err.message}`));
    });

    // ── Initiate the connection ─────────────────────────────────────────
    conn.connect({
      host: vpsIp,
      port: 22,
      username: sshUser,
      privateKey,
      readyTimeout: SSH_CONNECT_TIMEOUT_MS,
    });
  });
};

module.exports = {
  executeRemoteDeployment,
  SSH_CONNECT_TIMEOUT_MS,
};
