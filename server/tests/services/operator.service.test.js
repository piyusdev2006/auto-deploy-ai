/**
 * @file tests/services/operator.service.test.js
 * @description Unit tests for the Operator Agent (SSH deployment service).
 *
 * Strategy:
 *  - The ssh2 `Client` is fully mocked — no real SSH connections.
 *  - Real timers are used for most tests (process.nextTick resolves the
 *    Promise well within the 30 s timeout).
 *  - Fake timers are used ONLY for the VPS-timeout test.
 */

// ── Mock fs.readFileSync so no real PEM file is needed ──────────────────────
const mockReadFileSync = jest.fn();
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readFileSync: mockReadFileSync,
}));

// ── Mock ssh2 Client ────────────────────────────────────────────────────────
const mockExec = jest.fn();
const mockConnect = jest.fn();
const mockEnd = jest.fn();
const mockOn = jest.fn();

jest.mock("ssh2", () => {
  class MockClient {
    constructor() {
      this.exec = mockExec;
      this.connect = mockConnect;
      this.end = mockEnd;
      this.on = mockOn;

      // Wire up .on so handler lookup works.
      this.on.mockImplementation((event, handler) => {
        return this; // chainable
      });
    }
  }

  return { Client: MockClient };
});

const { executeRemoteDeployment } = require("../../services/operator.service");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Look up an event handler registered via mockOn. */
const getHandler = (event) => mockOn.mock.calls.find(([e]) => e === event)?.[1];

/**
 * Create a mock SSH stream that emits data / close events.
 */
const createMockStream = ({
  stdoutData = "Pulling images...\nDone.",
  stderrData = "",
  exitCode = 0,
} = {}) => {
  const stderrHandlers = {};
  const streamHandlers = {};

  const stream = {
    on: jest.fn((event, handler) => {
      streamHandlers[event] = handler;
      return stream;
    }),
    stderr: {
      on: jest.fn((event, handler) => {
        stderrHandlers[event] = handler;
        return stream.stderr;
      }),
    },
    /** Trigger all buffered events (stdout -> stderr -> close). */
    _emit: () => {
      if (stdoutData && streamHandlers.data) {
        streamHandlers.data(Buffer.from(stdoutData));
      }
      if (stderrData && stderrHandlers.data) {
        stderrHandlers.data(Buffer.from(stderrData));
      }
      if (streamHandlers.close) {
        streamHandlers.close(exitCode);
      }
    },
  };

  return stream;
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Operator Service — executeRemoteDeployment", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    // Point to a dummy PEM path; fs.readFileSync is mocked above.
    process.env.SSH_KEY_PATH = "./test-key.pem";
    process.env.VPS_USERNAME = "ubuntu";
    mockReadFileSync.mockReturnValue("fake-private-key-content");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ── Happy path ──────────────────────────────────────────────────────────
  test("should resolve with stdout/stderr on successful deployment", async () => {
    const stream = createMockStream({
      stdoutData: "Pulling images...\nContainers started.",
      stderrData: "",
      exitCode: 0,
    });

    mockExec.mockImplementation((_cmd, cb) => {
      cb(null, stream);
      process.nextTick(() => stream._emit());
    });

    mockConnect.mockImplementation(() => {
      process.nextTick(() => {
        const readyHandler = getHandler("ready");
        if (readyHandler) readyHandler();
      });
    });

    const result = await executeRemoteDeployment("10.0.0.1", "my-app");

    expect(result.stdout).toContain("Pulling images");
    expect(result.stdout).toContain("Containers started");
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "10.0.0.1",
        port: 22,
        username: "ubuntu",
        privateKey: "fake-private-key-content",
      }),
    );
  });

  // ── Correct command ────────────────────────────────────────────────────
  test("should execute the correct docker compose commands", async () => {
    const stream = createMockStream({ exitCode: 0 });

    mockExec.mockImplementation((_cmd, cb) => {
      cb(null, stream);
      process.nextTick(() => stream._emit());
    });

    mockConnect.mockImplementation(() => {
      process.nextTick(() => {
        const readyHandler = getHandler("ready");
        if (readyHandler) readyHandler();
      });
    });

    await executeRemoteDeployment("10.0.0.1", "test-project");

    const executedCommand = mockExec.mock.calls[0][0];
    expect(executedCommand).toContain("cd /opt/test-project");
    expect(executedCommand).toContain("docker compose pull");
    expect(executedCommand).toContain("docker compose up -d");
  });

  // ── Non-zero exit code ─────────────────────────────────────────────────
  test("should reject when command exits with non-zero code", async () => {
    const stream = createMockStream({
      stderrData: "Error: container failed to start",
      exitCode: 1,
    });

    mockExec.mockImplementation((_cmd, cb) => {
      cb(null, stream);
      process.nextTick(() => stream._emit());
    });

    mockConnect.mockImplementation(() => {
      process.nextTick(() => {
        const readyHandler = getHandler("ready");
        if (readyHandler) readyHandler();
      });
    });

    await expect(executeRemoteDeployment("10.0.0.1", "my-app")).rejects.toThrow(
      "exited with code 1",
    );
  });

  // ── SSH connection error ───────────────────────────────────────────────
  test("should reject on SSH connection error", async () => {
    mockConnect.mockImplementation(() => {
      process.nextTick(() => {
        const errorHandler = getHandler("error");
        if (errorHandler) errorHandler(new Error("Connection refused"));
      });
    });

    await expect(executeRemoteDeployment("10.0.0.1", "my-app")).rejects.toThrow(
      "SSH connection error",
    );
  });

  // ── SSH exec error ────────────────────────────────────────────────────
  test("should reject when exec callback returns an error", async () => {
    mockExec.mockImplementation((_cmd, cb) => {
      cb(new Error("Channel open failure"), null);
    });

    mockConnect.mockImplementation(() => {
      process.nextTick(() => {
        const readyHandler = getHandler("ready");
        if (readyHandler) readyHandler();
      });
    });

    await expect(executeRemoteDeployment("10.0.0.1", "my-app")).rejects.toThrow(
      "SSH exec error",
    );
  });

  // ── VPS Unreachable (30 s timeout — PRD Edge Case 3) ──────────────────
  test("should reject with 'VPS Unreachable' after 30 s timeout", async () => {
    jest.useFakeTimers();

    // connect() does nothing — simulates an unresponsive host.
    mockConnect.mockImplementation(() => {});

    const promise = executeRemoteDeployment("10.0.0.1", "my-app");

    // Advance the clock past the 30 s timeout.
    jest.advanceTimersByTime(30_000);

    await expect(promise).rejects.toThrow("VPS Unreachable");

    jest.useRealTimers();
  });

  // ── Input validation ───────────────────────────────────────────────────
  test("should reject on empty vpsIp", async () => {
    await expect(executeRemoteDeployment("", "my-app")).rejects.toThrow(
      "vpsIp must be a non-empty string",
    );
  });

  test("should reject on empty projectName", async () => {
    await expect(executeRemoteDeployment("10.0.0.1", "")).rejects.toThrow(
      "projectName must be a non-empty string",
    );
  });

  // ── Missing SSH_KEY_PATH ───────────────────────────────────────────────
  test("should reject when SSH_KEY_PATH is not set", async () => {
    delete process.env.SSH_KEY_PATH;

    await expect(executeRemoteDeployment("10.0.0.1", "my-app")).rejects.toThrow(
      "SSH_KEY_PATH environment variable is not set",
    );
  });

  // ── Unreadable PEM file ────────────────────────────────────────────────
  test("should reject when SSH key file cannot be read", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    await expect(executeRemoteDeployment("10.0.0.1", "my-app")).rejects.toThrow(
      "Failed to read SSH key file",
    );
  });
});
