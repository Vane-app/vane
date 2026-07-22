/**
 * The falcon's judgement, demonstrated offline.
 *
 * Runs the real decision engine — the same code path production uses — against
 * three scenarios, with no chain, no keys and no network. This is the 30 seconds
 * of the demo that proves Vane is an agent and not a payment script.
 *
 *   npm run demo -w agent
 */
import { evaluate, detectCluster, type ConversionClaim, type WalletSignals, type TaskerSignals } from "./decision.js";

const NOW = Math.floor(Date.now() / 1000);
const AMBER = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function scenario(
  title: string,
  blurb: string,
  claim: ConversionClaim,
  wallet: WalletSignals,
  tasker: TaskerSignals,
) {
  const d = evaluate(claim, wallet, tasker, NOW);
  const paid = d.verdict !== "hold";
  const colour = paid ? GREEN : RED;
  const mark = paid ? "PAID" : "HELD";

  console.log(`${BOLD}${title}${RESET}`);
  console.log(`${DIM}${blurb}${RESET}\n`);
  console.log(`  ${colour}${BOLD}${mark}${RESET}   risk ${d.risk}/100`);
  console.log(`  ${colour}${d.reason}${RESET}`);
  console.log(`${DIM}  what the falcon checked:${RESET}`);
  for (const s of d.signals) console.log(`${DIM}    · ${s}${RESET}`);
  console.log();
  return d;
}

const honestTasker: TaskerSignals = {
  address: "0xTunde000000000000000000000000000000000001" as `0x${string}`,
  settledCount: 42,
  heldCount: 1,
  lastHourCount: 3,
  distinctFunders: 11,
  referredCount: 12,
};

const farmTasker: TaskerSignals = {
  address: "0xFarm00000000000000000000000000000000000002" as `0x${string}`,
  settledCount: 2,
  heldCount: 9,
  lastHourCount: 48,
  distinctFunders: 1,
  referredCount: 24,
};

console.log(`\n${AMBER}${BOLD}  Vane — the falcon's judgement${RESET}`);
console.log(`${DIM}  Same decision engine the live agent runs. No chain required.${RESET}\n`);
console.log(`${DIM}${"─".repeat(72)}${RESET}\n`);

// 1 — the honest result
scenario(
  "1. A real referral",
  "Tunde shared his link this morning. Someone signed up, then kept using the app.",
  {
    campaignId: 1n,
    wallet: "0xA11ce00000000000000000000000000000000011" as `0x${string}`,
    actionIndex: 1n,
    kind: "signup",
    observedAt: NOW - 3600,
  },
  {
    sealedAt: NOW - 4200, // browsed for ten minutes before signing up
    firstSeenAt: NOW - 86400 * 30, // wallet is a month old
    txCount: 24,
    txCountAfterConversion: 6, // came back and used the product
    usdcBalance: 42_000_000n,
  },
  honestTasker,
);

// 2 — the sybil farm
scenario(
  "2. A sybil farm",
  "Twenty-four fresh wallets, one funding source, converting seconds after first touch.",
  {
    campaignId: 1n,
    wallet: "0xB0700000000000000000000000000000000000f1" as `0x${string}`,
    actionIndex: 2n,
    kind: "signup",
    observedAt: NOW - 1800,
  },
  {
    sealedAt: NOW - 1808, // converted 8 seconds after arriving
    firstSeenAt: NOW - 1815, // wallet created moments earlier
    txCount: 1,
    txCountAfterConversion: 0, // silent ever since
    usdcBalance: 0n,
  },
  farmTasker,
);

// 3 — the honest newcomer, who must not be punished for being new
scenario(
  "3. A brand-new tasker",
  "Nobody has a track record on day one. Being new is not the same as being fraudulent.",
  {
    campaignId: 1n,
    wallet: "0xC0ffee000000000000000000000000000000ee01" as `0x${string}`,
    actionIndex: 3n,
    kind: "signup",
    observedAt: NOW - 7200,
  },
  {
    sealedAt: NOW - 8000,
    firstSeenAt: NOW - 86400 * 5,
    txCount: 7,
    txCountAfterConversion: 2,
    usdcBalance: 5_000_000n,
  },
  {
    address: "0xNew000000000000000000000000000000000003" as `0x${string}`,
    settledCount: 0,
    heldCount: 0,
    lastHourCount: 1,
    distinctFunders: 2,
    referredCount: 2,
  },
);

// 4 — the pattern only visible across a batch
console.log(`${BOLD}4. Cluster detection${RESET}`);
console.log(`${DIM}Individually unremarkable wallets. The pattern is the evidence.${RESET}\n`);
const cluster = detectCluster([
  { wallet: "0x01" as `0x${string}`, sealedAt: NOW - 5000 },
  { wallet: "0x02" as `0x${string}`, sealedAt: NOW - 4990 },
  { wallet: "0x03" as `0x${string}`, sealedAt: NOW - 4975 },
  { wallet: "0x04" as `0x${string}`, sealedAt: NOW - 4960 },
  { wallet: "0x05" as `0x${string}`, sealedAt: NOW - 86000 },
]);
if (cluster.reason) {
  console.log(`  ${RED}${BOLD}FLAGGED${RESET}  ${cluster.reason}`);
  console.log(`${DIM}  wallets: ${cluster.clustered.join(", ")}${RESET}\n`);
}

console.log(`${DIM}${"─".repeat(72)}${RESET}`);
console.log(`${DIM}  Honest work paid in seconds. Fraud refused, with a reason.${RESET}\n`);
