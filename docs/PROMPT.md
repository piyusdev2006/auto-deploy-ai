Prompt 1

Act as a Staff MERN Engineer. I have provided the PRD for AutoDeploy AI. We will build this iteratively with strict Test-Driven Development (TDD). 

**Phase 1: Backend Setup, DB, and Auth**
1. Provide the exact terminal commands to initialize the Node/Express backend.
2. Write the Express server setup with `helmet`, `cors`, and `dotenv`.
3. Write the Mongoose connection utility and the schemas for `User`, `Project`, and `Deployment` (ensure the GitHub token is encrypted before saving).
4. Implement the GitHub OAuth flow using Passport.js.
5. Set up Jest & Supertest. Write unit tests for the MongoDB connection and integration tests for the authentication routes.

Provide only Phase 1. Ensure the code is highly modular.

Prompt 2: The AI Agents (LangChain)
(Only send this after Phase 1 is working and tested)

**Phase 2: LangChain Agent Architecture**
1. Create a `services/ai.service.js` file.
2. Set up LangChain.js to use the chosen LLM (Gemini/Groq).
3. Write the `Architect Agent` function: It takes an array of file names from a repo, determines the tech stack, and outputs a JSON object containing a `Dockerfile` and `docker-compose.yml` string.
4. Write the `Pipeline Agent` function: It generates the `.github/workflows/deploy.yml` string.
5. Write Jest unit tests for these services. **Crucial:** You must mock the LLM response in the tests so we don't hit the actual API during testing. Cover the edge case where the AI returns invalid JSON.


Prompt 3: GitHub API & Integration
(Only send this after Phase 2 is working)

**Phase 3: GitHub Commits & Deployment Webhooks**
1. Create `services/github.service.js` using the Octokit library.
2. Write a function that takes the AI-generated files (from Phase 2) and commits them to a new `devops-setup` branch on the user's repository.
3. Create an Express route (`POST /api/deploy`) that strings Phase 2 and Phase 3 together: Takes a repo URL, generates the files via AI, and commits them via Octokit.
4. Write integration tests using Supertest for the `/api/deploy` endpoint, mocking the Octokit and LangChain calls. Cover the edge case where the GitHub token has been revoked (401 error).