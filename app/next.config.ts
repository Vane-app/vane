import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { join } from "node:path";

/**
 * Load the repo-root .env before Next reads config.
 *
 * Next only looks for .env files in its own project directory, so in this monorepo it
 * would silently miss the root .env that the contracts and the agent already use. The
 * symptom is not an error — it is the app quietly falling back to demo wallets because
 * CIRCLE_API_KEY appears unset. One .env, at the root, read by everything.
 */
loadEnv({ path: join(process.cwd(), "..", ".env") });

const nextConfig: NextConfig = {
  /**
   * Pin a browser to the build it loaded.
   *
   * A tab open across a deployment ends up running JavaScript that no longer matches
   * the server. When that happens a Link click can fall out of client-side routing and
   * navigate straight at the React payload, which is served as text/x-component — a
   * type no browser renders, so it downloads instead. Someone pressing "Get started"
   * gets a file, which is about the worst possible first impression.
   *
   * Stamping the deployment id makes those requests resolve against the build the page
   * came from, so a deploy mid-session stops being the visitor's problem.
   */
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  /**
   * The falcon's judgement ships as TypeScript source from the agent workspace.
   *
   * Settlement has to run somewhere that is awake when a judge is clicking, and the
   * agent's watch loop lives on a developer's laptop. Rather than reimplement scoring
   * behind a cron route — a second copy that would drift from the first and judge the
   * same result differently — the app imports the same module the agent runs.
   */
  transpilePackages: ["@vane/agent"],
};

export default nextConfig;
