// AI service — LangChain agents for generating Dockerfiles, compose files, and CI pipelines.
// Supports Gemini (default) and Groq providers via LLM_PROVIDER env var.

const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatGroq } = require("@langchain/groq");
const { z } = require("zod");
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

const ciPipelineSchema = z.object({
  workflowYaml: z
    .string()
    .describe(
      "Complete GitHub Actions .github/workflows/deploy.yml content that builds and pushes the Docker image to the VPS.",
    ),
});

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

const generateInfrastructure = async (repoContext) => {
  if (!repoContext || typeof repoContext !== "string") {
    throw new Error("repoContext must be a non-empty string.");
  }

  const llm = createLLM();
  const structuredLlm = llm.withStructuredOutput(infrastructureSchema);
  const messages = await architectPrompt.formatMessages({ repoContext });
  const result = await structuredLlm.invoke(messages);
  return result;
};

const generateCI = async (repoContext) => {
  if (!repoContext || typeof repoContext !== "string") {
    throw new Error("repoContext must be a non-empty string.");
  }

  const llm = createLLM();
  const structuredLlm = llm.withStructuredOutput(ciPipelineSchema);
  const messages = await pipelinePrompt.formatMessages({ repoContext });
  const result = await structuredLlm.invoke(messages);
  return result.workflowYaml;
};

module.exports = {
  generateInfrastructure,
  generateCI,
  createLLM,
  infrastructureSchema,
  ciPipelineSchema,
  ARCHITECT_SYSTEM_PROMPT,
  PIPELINE_SYSTEM_PROMPT,
};
