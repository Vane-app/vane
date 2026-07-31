import { config as loadEnv } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads the repo-root .env.
 *
 * `import "dotenv/config"` resolves relative to the working directory, and npm runs
 * workspace scripts from the workspace folder — so it would look for contracts/.env
 * and silently find nothing. There is one .env, at the root, and every script reads it
 * from here. Import this before anything that touches process.env.
 */
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env") });
