import { config as loadEnv } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads the repo-root .env.
 *
 * `import "dotenv/config"` resolves against the working directory, and npm runs workspace
 * scripts from the workspace folder — so it looks for agent/.env and silently finds
 * nothing, leaving every address undefined. Import this before ./config.js, which reads
 * process.env at module load.
 */
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env") });
