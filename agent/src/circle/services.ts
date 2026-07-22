import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Agent-to-agent commerce.
 *
 * The falcon pays for the data it uses. When a verification needs an external
 * signal — wallet-reputation lookups, sanctions screening, a social API check —
 * the agent discovers the service on Circle's marketplace and settles the call in
 * USDC autonomously, no human and no invoice in the loop. The cost of each
 * verification lands in the decision log next to the decision it paid for.
 *
 * This is a real machine-to-machine economy running inside a human marketplace:
 * businesses pay the agent for outcomes, and the agent pays other services for
 * the evidence behind them.
 *
 * Safety: values that come back from a seller are never interpolated into a shell.
 * We use execFile with an argument array (no shell), and validate anything the
 * seller controls before it is used.
 */

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const UNSAFE = /[;|&$`{}<>\\\n\r]/;

export interface ServiceQuote {
  url: string;
  price: string;
  chain: string;
  method: string;
}

function assertSafeUrl(url: string) {
  if (UNSAFE.test(url)) throw new Error(`Refusing to use a service URL containing shell metacharacters: ${url}`);
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error(`Refusing a non-HTTPS service endpoint: ${url}`);
}

async function circle(args: string[]) {
  const { stdout } = await run("circle", [...args, "--output", "json"], { timeout: 30_000 });
  return JSON.parse(stdout);
}

/** Find a paid service by keyword, e.g. "wallet risk score". */
export async function searchServices(keyword: string): Promise<ServiceQuote[]> {
  const res = await circle(["services", "search", keyword]);
  return (res?.services ?? res ?? []) as ServiceQuote[];
}

/** Confirm the live price and accepted chains before spending anything. */
export async function inspectService(url: string) {
  assertSafeUrl(url);
  return circle(["services", "inspect", url]);
}

/** Preview the cost without settling — the agent always quotes before it buys. */
export async function estimateCost(url: string, method = "GET") {
  assertSafeUrl(url);
  if (!METHODS.has(method)) throw new Error(`Unsupported HTTP method: ${method}`);
  return circle(["services", "pay", url, "-X", method, "--estimate"]);
}

/**
 * Pay for and execute one service call.
 * Returns both the service response and what the falcon spent to get it.
 */
export async function payAndCall(params: {
  url: string;
  method?: string;
  chain: string;
  address: string;
  body?: unknown;
}): Promise<{ response: unknown; cost: string }> {
  assertSafeUrl(params.url);
  const method = params.method ?? "GET";
  if (!METHODS.has(method)) throw new Error(`Unsupported HTTP method: ${method}`);

  const args = [
    "services",
    "pay",
    params.url,
    "-X",
    method,
    "--address",
    params.address,
    "--chain",
    params.chain,
  ];
  if (params.body !== undefined) args.push("--data", JSON.stringify(params.body));

  const res = await circle(args);
  return { response: res?.response ?? res, cost: res?.cost ?? res?.amount ?? "0" };
}

/** The agent's own operating balance. */
export async function agentBalance() {
  return circle(["wallet", "balance"]);
}
