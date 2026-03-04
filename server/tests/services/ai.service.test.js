/**
 * @file tests/services/ai.service.test.js
 * @description Unit tests for the AI service (Architect & Pipeline agents).
 *
 * Strategy:
 *  - We mock the LangChain LLM constructors so NO real API calls are made.
 *  - `withStructuredOutput()` returns `{ invoke: mockFn }` — which is exactly
 *    what the refactored service calls (`structuredLlm.invoke(messages)`).
 *  - We test happy paths, input validation, error propagation, and provider swap.
 */

// ── Mock the LLM constructors BEFORE importing the service ──────────────────
// Jest hoists jest.mock(), so these factories run before any require().

jest.mock("@langchain/google-genai", () => {
  const mockInvoke = jest.fn();

  class MockChatGoogleGenerativeAI {
    constructor() {
      // withStructuredOutput returns an object with an invoke method.
      // The service calls `structuredLlm.invoke(messages)` directly.
      this.withStructuredOutput = jest.fn().mockReturnValue({
        invoke: mockInvoke,
      });
    }
  }

  return {
    ChatGoogleGenerativeAI: MockChatGoogleGenerativeAI,
    __mockInvoke: mockInvoke, // escape hatch for test assertions
  };
});

jest.mock("@langchain/groq", () => {
  const mockInvoke = jest.fn();

  class MockChatGroq {
    constructor() {
      this.withStructuredOutput = jest.fn().mockReturnValue({
        invoke: mockInvoke,
      });
    }
  }

  return {
    ChatGroq: MockChatGroq,
    __mockInvoke: mockInvoke,
  };
});

// ── Now import the service (it receives the mocked constructors) ────────────
const {
  generateInfrastructure,
  generateCI,
} = require("../../services/ai.service");

// Grab the mock invoke functions.
const { __mockInvoke: geminiMockInvoke } = require("@langchain/google-genai");
const { __mockInvoke: groqMockInvoke } = require("@langchain/groq");

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_REPO_CONTEXT = `
Tech stack: React (Vite) frontend, served by nginx in production.
Entry point: src/main.jsx
Package manager: npm
Node version: 20
Build command: npm run build
Output directory: dist/
Port: 80 (nginx)
`;

const VALID_INFRA_RESPONSE = {
  dockerfile: `FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`,

  dockerCompose: `version: "3.8"
services:
  web:
    build: .
    ports:
      - "80:80"
    restart: unless-stopped`,
};

const VALID_CI_RESPONSE = {
  workflowYaml: `name: Deploy
on:
  push:
    branches: [main, devops-setup]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: \${{ secrets.VPS_HOST }}
          username: \${{ secrets.VPS_USER }}
          key: \${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /app
            git pull
            docker compose up -d --build`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Architect Agent
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Service — Architect Agent (generateInfrastructure)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LLM_PROVIDER;
  });

  // ── Happy path ──────────────────────────────────────────────────────────
  test("should return { dockerfile, dockerCompose } on valid LLM response", async () => {
    geminiMockInvoke.mockResolvedValueOnce(VALID_INFRA_RESPONSE);

    const result = await generateInfrastructure(SAMPLE_REPO_CONTEXT);

    expect(result).toEqual(VALID_INFRA_RESPONSE);
    expect(result).toHaveProperty("dockerfile");
    expect(result).toHaveProperty("dockerCompose");
    expect(typeof result.dockerfile).toBe("string");
    expect(typeof result.dockerCompose).toBe("string");
    expect(result.dockerfile).toContain("FROM");
    expect(result.dockerCompose).toContain("services");
  });

  // ── Invocation ─────────────────────────────────────────────────────────
  test("should invoke the structured LLM with formatted messages", async () => {
    geminiMockInvoke.mockResolvedValueOnce(VALID_INFRA_RESPONSE);

    await generateInfrastructure(SAMPLE_REPO_CONTEXT);

    // The mock is called once with the formatted prompt messages (BaseMessage[]).
    expect(geminiMockInvoke).toHaveBeenCalledTimes(1);

    // First arg should be an array of LangChain messages.
    const callArg = geminiMockInvoke.mock.calls[0][0];
    expect(Array.isArray(callArg)).toBe(true);
    expect(callArg.length).toBe(2); // system + human
  });

  // ── Input validation ───────────────────────────────────────────────────
  test("should throw on empty / missing repoContext", async () => {
    await expect(generateInfrastructure("")).rejects.toThrow(
      "repoContext must be a non-empty string",
    );
    await expect(generateInfrastructure(null)).rejects.toThrow(
      "repoContext must be a non-empty string",
    );
    await expect(generateInfrastructure(undefined)).rejects.toThrow(
      "repoContext must be a non-empty string",
    );
  });

  // ── Malformed LLM response (Zod rejection) ────────────────────────────
  test("should propagate error when LLM returns malformed JSON", async () => {
    geminiMockInvoke.mockRejectedValueOnce(
      new Error("Zod validation failed: missing required key 'dockerfile'"),
    );

    await expect(generateInfrastructure(SAMPLE_REPO_CONTEXT)).rejects.toThrow(
      "Zod validation failed",
    );
  });

  // ── LLM network / API error ────────────────────────────────────────────
  test("should propagate LLM API errors", async () => {
    geminiMockInvoke.mockRejectedValueOnce(
      new Error("401 Unauthorized: Invalid API key"),
    );

    await expect(generateInfrastructure(SAMPLE_REPO_CONTEXT)).rejects.toThrow(
      "401 Unauthorized",
    );
  });

  // ── Groq provider swap ────────────────────────────────────────────────
  test("should use Groq when LLM_PROVIDER=groq", async () => {
    process.env.LLM_PROVIDER = "groq";
    groqMockInvoke.mockResolvedValueOnce(VALID_INFRA_RESPONSE);

    const result = await generateInfrastructure(SAMPLE_REPO_CONTEXT);

    expect(result).toEqual(VALID_INFRA_RESPONSE);
    expect(groqMockInvoke).toHaveBeenCalledTimes(1);
    // Gemini mock should NOT have been called.
    expect(geminiMockInvoke).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Pipeline Agent
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Service — Pipeline Agent (generateCI)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LLM_PROVIDER;
  });

  // ── Happy path ──────────────────────────────────────────────────────────
  test("should return a YAML string on valid LLM response", async () => {
    geminiMockInvoke.mockResolvedValueOnce(VALID_CI_RESPONSE);

    const result = await generateCI(SAMPLE_REPO_CONTEXT);

    expect(typeof result).toBe("string");
    expect(result).toContain("name: Deploy");
    expect(result).toContain("docker compose");
  });

  // ── Unwraps workflowYaml ───────────────────────────────────────────────
  test("should unwrap the workflowYaml key from the structured response", async () => {
    geminiMockInvoke.mockResolvedValueOnce(VALID_CI_RESPONSE);

    const result = await generateCI(SAMPLE_REPO_CONTEXT);

    // Should be the raw YAML string, not the wrapper object.
    expect(result).toBe(VALID_CI_RESPONSE.workflowYaml);
  });

  // ── Input validation ───────────────────────────────────────────────────
  test("should throw on empty / missing repoContext", async () => {
    await expect(generateCI("")).rejects.toThrow(
      "repoContext must be a non-empty string",
    );
    await expect(generateCI(42)).rejects.toThrow(
      "repoContext must be a non-empty string",
    );
  });

  // ── Malformed LLM response ────────────────────────────────────────────
  test("should propagate error when LLM returns invalid structure", async () => {
    geminiMockInvoke.mockRejectedValueOnce(
      new Error("Zod validation failed: expected string, received number"),
    );

    await expect(generateCI(SAMPLE_REPO_CONTEXT)).rejects.toThrow(
      "Zod validation failed",
    );
  });

  // ── LLM timeout / network error ───────────────────────────────────────
  test("should propagate network errors from the LLM", async () => {
    geminiMockInvoke.mockRejectedValueOnce(
      new Error("ECONNREFUSED: connect ECONNREFUSED"),
    );

    await expect(generateCI(SAMPLE_REPO_CONTEXT)).rejects.toThrow(
      "ECONNREFUSED",
    );
  });

  // ── Groq provider swap ────────────────────────────────────────────────
  test("should use Groq when LLM_PROVIDER=groq", async () => {
    process.env.LLM_PROVIDER = "groq";
    groqMockInvoke.mockResolvedValueOnce(VALID_CI_RESPONSE);

    const result = await generateCI(SAMPLE_REPO_CONTEXT);

    expect(result).toBe(VALID_CI_RESPONSE.workflowYaml);
    expect(groqMockInvoke).toHaveBeenCalledTimes(1);
    expect(geminiMockInvoke).not.toHaveBeenCalled();
  });
});
