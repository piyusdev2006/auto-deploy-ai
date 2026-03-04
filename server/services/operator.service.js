// Operator service — SSH into VPS and run Docker deployment.

const fs = require("fs");
const path = require("path");
const { Client } = require("ssh2");

const SSH_CONNECT_TIMEOUT_MS = 30_000;

const executeRemoteDeployment = (vpsIp, projectName) => {
  return new Promise((resolve, reject) => {
    if (!vpsIp || typeof vpsIp !== "string") {
      return reject(new Error("vpsIp must be a non-empty string."));
    }
    if (!projectName || typeof projectName !== "string") {
      return reject(new Error("projectName must be a non-empty string."));
    }

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

    let stdout = "";
    let stderr = "";

    const timeoutId = setTimeout(() => {
      conn.end();
      reject(new Error("VPS Unreachable."));
    }, SSH_CONNECT_TIMEOUT_MS);

    conn.on("ready", () => {
      clearTimeout(timeoutId);

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
