import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The Postgres connection, or null when DATABASE_URL isn't set.
 *
 * When null, the repository (../store.ts) falls back to a seeded in-memory
 * store so the app runs with no database — the demo never breaks. Set
 * DATABASE_URL (Neon, via the Vercel Marketplace) to go live.
 */

const url = process.env.DATABASE_URL;

let client: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

if (url) {
  client = postgres(url, { prepare: false });
  dbInstance = drizzle(client, { schema });
}

export const db = dbInstance;
export const hasDatabase = Boolean(url);
export { schema };
