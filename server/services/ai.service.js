/**
 * @file services/ai.service.js
 * @description AI orchestration layer — LangChain agents for DevOps automation.
 *
 * Exposes two public functions consumed by the Express routes:
 *  • generateInfrastructure(repoContext) → { dockerfile, dockerCompose }
 *  • generateCI(repoContext)            → deploy.yml string
 *
 * LLM provider is hot-swappable via the LLM_PROVIDER env var:
 *  • "gemini" (default) — Google Gemini 1.5 Flash
 *  • "groq"             — Groq (Llama 3.3 70B Versatile)
 *
 * All LLM calls use LangChain's structured output (Zod schemas) so we get
 * deterministic, validated JSON — no fragile regex parsing.
 */

const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatGroq } = require("@langchain/groq");
const { z } = require("zod");

// ─────────────────────────────────────────────────────────────────────────────
// 1. LLM Factory — instantiate the right model based on env config
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create and return the configured LLM instance.
 * Reads LLM_PROVIDER, GOOGLE_API_KEY / GROQ_API_KEY from process.env.
 *
 * @returns {import("@langchain/core/language_models/chat_models").BaseChatModel}
 */
const createLLM = () => {
  const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();

  if (provider === "groq") {
    return new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0, // deterministic for infra generation
    });
  }

  // Default: Gemini 1.5 Flash
  return new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
    temperature: 0,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Zod Schemas — strict output contracts for LangChain structured output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for the Architect Agent's response.
 * Enforces exactly two string keys: dockerfile, dockerCompose.
 */
const infrastructureSchema = z.object({
  dockerfile: z
    .string()
    .describe("Complete, optimised, multi-stage Dockerfile content."),
  dockerCompose: z
    .string()
    .describe(
      "Complete docker-compose.yml content with the service definition.",
    ),
});

/**
 * Schema for the Pipeline Agent's response.
 * Enforces a single string key: workflowYaml.
 */
const ciPipelineSchema = z.object({
  workflowYaml: z
    .string()
    .describe(
      "Complete GitHub Actions .github/workflows/deploy.yml content that builds and pushes the Docker image to the VPS.",
    ),
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Prompt Templates
// ─────────────────────────────────────────────────────────────────────────────

const ARCHITECT_SYSTEM_PROMPT = `You are a Senior DevOps Engineer specialising in containerisation and cloud deployments.

TASK:
Given the repository context below, generate TWO production-ready files:
1. A multi-stage, optimised Dockerfile that:
   - Uses the smallest appropriate base image.
   - Separates dependency installation from the application copy (layer caching).
   - Runs the application as a non-root user.
   - Exposes the correct port.
2. A docker-compose.yml that:
   - Defines a single service using the built image.
   - Maps the exposed port.
   - Sets a restart policy.
   - Includes a healthcheck if appropriate.

RULES:
- Return ONLY valid JSON matching the required schema.
- Do NOT include markdown fences, comments, or explanations outside the JSON.
- Ensure the Dockerfile and docker-compose.yml are syntactically correct.`;

const PIPELINE_SYSTEM_PROMPT = `You are a Senior DevOps Engineer specialising in CI/CD pipelines.

TASK:
Given the repository context below, generate a GitHub Actions workflow file
(.github/workflows/deploy.yml) that:
1. Triggers on pushes to the "main" branch and "devops-setup" branch.
2. Builds the Docker image using the Dockerfile in the repo root.
3. Uses SSH (via appleboy/ssh-action or equivalent) to:
   a. Pull the latest code on the VPS.
   b. Rebuild and restart Docker containers with docker-compose.
4. Uses GitHub Secrets for sensitive values (VPS_HOST, VPS_USER, VPS_SSH_KEY, etc.).

RULES:
- Return ONLY valid JSON matching the required schema.
- Do NOT include markdown fences, comments, or explanations outside the JSON.
- The workflow YAML must be syntactically correct.`;

const architectPrompt = ChatPromptTemplate.fromMessages([
  ["system", ARCHITECT_SYSTEM_PROMPT],
  ["human", "Repository Context:\n{repoContext}"],
]);

const pipelinePrompt = ChatPromptTemplate.fromMessages([
  ["system", PIPELINE_SYSTEM_PROMPT],
  ["human", "Repository Context:\n{repoContext}"],
]);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Architect Agent — generates Dockerfile + docker-compose.yml.
 *
 * @param {string} repoContext  Description of the repo's tech stack, file
 *                              structure, and entry points.
 * @returns {Promise<{ dockerfile: string, dockerCompose: string }>}
 * @throws {Error} If the LLM returns unparseable / non-conforming output.
 */
const generateInfrastructure = async (repoContext) => {
  if (!repoContext || typeof repoContext !== "string") {
    throw new Error("repoContext must be a non-empty string.");
  }

  const llm = createLLM();

  // Bind the Zod schema so LangChain enforces structured output.
  const structuredLlm = llm.withStructuredOutput(infrastructureSchema);

  // Two-step: format the prompt, then invoke the structured LLM directly.
  // This is functionally identical to prompt.pipe(structuredLlm).invoke()
  // but allows clean unit testing with simple { invoke } mocks.
  const messages = await architectPrompt.formatMessages({ repoContext });
  const result = await structuredLlm.invoke(messages);

  return result; // already validated by Zod
};

/**
 * The Pipeline Agent — generates a GitHub Actions deploy.yml.
 *
 * @param {string} repoContext  Description of the repo's tech stack and branch
 *                              strategy.
 * @returns {Promise<string>}   The deploy.yml content as a plain string.
 * @throws {Error} If the LLM returns unparseable output.
 */
const generateCI = async (repoContext) => {
  if (!repoContext || typeof repoContext !== "string") {
    throw new Error("repoContext must be a non-empty string.");
  }

  const llm = createLLM();

  const structuredLlm = llm.withStructuredOutput(ciPipelineSchema);

  const messages = await pipelinePrompt.formatMessages({ repoContext });
  const result = await structuredLlm.invoke(messages);

  return result.workflowYaml; // unwrap — callers just need the YAML string
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Public API
  generateInfrastructure,
  generateCI,

  // Exported for testing / advanced usage
  createLLM,
  infrastructureSchema,
  ciPipelineSchema,
  ARCHITECT_SYSTEM_PROMPT,
  PIPELINE_SYSTEM_PROMPT,
};
