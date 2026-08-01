import { config as loadEnv } from "dotenv";
import { join } from "node:path";
import type { Config } from "drizzle-kit";

/**
 * Drizzle config.
 *
 * Reads the repo-root .env like everything else here — Next, the agent and the
 * contract scripts all point at the same one file, and drizzle-kit defaulting to its
 * own directory is the same trap that silently broke the deploy scripts earlier.
 *
 * Apply with:  npm run db:push -w app
 */
loadEnv({ path: join(process.cwd(), "..", ".env") });

export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
