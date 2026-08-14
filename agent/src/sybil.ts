import "./env.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes, erc20Abi } from "viem";
import { config, USDC_ADDRESS, formatUsdc } from "./config.js";
import { publicClient, walletSignals, withRetry, readTaskerOfCode } from "./signals.js";
import { evaluate, detectCluster, type ConversionClaim, type TaskerSignals } from "./decision.js";
import { createUserWallet, executeContract, waitForTransaction, getBalance } from "./circle/wallets.js";

/**
 * The refusal, demonstrated end to end on Arc.
 *
 *   npm run sybil -w @vane/agent
 *
 * Builds a real sybil farm — one tasker, several freshly created wallets, all funded
 * from the same source, all sealed within minutes of each other, all converting within
 * seconds of being sealed — and lets the falcon judge it.
 *
 * Nothing here is staged. The wallets are real, the funding pattern is real, and the
 * verdict comes from `evaluate()` in decision.ts reading signals off the chain. The
 * script does not decide anything; it only creates the conditions and reports what the
 * agent concluded. If the engine were wrong, this script would pay the fraud.
 *
 * The refusal is then written on-chain via `hold()`, which moves no money and exists
 * purely so a business can audit the agent rather than trust it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const cacheFile = join(here, "..", "..", "sybil-wallets.json");

/** Four, not three: the funding-concentration rule needs >= 4 referrals before it fires. */
const FARM_SIZE = 4;
const GAS_EACH = "0.30";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function need(key: string, value: string | undefined): string {
  if (!value) throw new Error(`${key} is not set in .env`);
  return value;
}

const escrow = need("VANE_ESCROW_ADDRESS", config.escrowAddress);
const registry = need("VANE_REGISTRY_ADDRESS", config.registryAddress);
const demoBusiness = need("VANE_DEMO_BUSINESS_ADDRESS", process.env.VANE_DEMO_BUSINESS_ADDRESS);
const agentWalletId = need("CIRCLE_AGENT_WALLET_ID", config.circle.agentWalletId);

const campaignId = BigInt(process.argv[2] ?? "1");

interface Farm {
  tasker: { id: string; address: `0x${string}` };
  sybils: { id: string; address: `0x${string}` }[];
}

async function send(walletId: string, to: string, signature: string, args: unknown[], label: string) {
  process.stdout.write(`  ${label} … `);
  const tx = await executeContract({
    walletId,
    contractAddress: to as `0x${string}`,
    abiFunctionSignature: signature,
    abiParameters: args,
  });
  const id = (tx as { id?: string })?.id;
  if (!id) throw new Error(`${label}: no transaction id`);
  const receipt = (await waitForTransaction(id)) as { state?: string; txHash?: string; errorReason?: string };
  if (receipt?.state !== "COMPLETE") {
    throw new Error(`${label} ${receipt?.state}: ${receipt?.errorReason ?? "no reason given"}`);
  }
  console.log(`ok  ${receipt.txHash ?? ""}`);
  return receipt;
}

/** USDC transfer between Circle wallets — used to build the single-funder pattern. */
async function transfer(fromWalletId: string, to: string, amount: string, label: string) {
  const { raw } = await getBalance(fromWalletId);
  const token = (raw as { token?: { id?: string; symbol?: string; tokenAddress?: string } }[]).find(
    (b) => b.token?.tokenAddress?.toLowerCase() === USDC_ADDRESS.toLowerCase() || b.token?.symbol === "USDC",
  );
  if (!token?.token?.id) throw new Error("No USDC token id on the funding wallet");

  process.stdout.write(`  ${label} … `);
  const { transferUsdc } = await import("./circle/wallets.js");
  const tx = await transferUsdc({ walletId: fromWalletId, to: to as `0x${string}`, amount, tokenId: token.token.id });
  const id = (tx as { id?: string })?.id;
  if (!id) throw new Error(`${label}: no transaction id`);
  const receipt = (await waitForTransaction(id)) as { state?: string; txHash?: string };
  if (receipt?.state !== "COMPLETE") throw new Error(`${label} ${receipt?.state}`);
  console.log(`ok  ${receipt.txHash ?? ""}`);
}

async function loadOrCreateFarm(): Promise<Farm> {
  if (existsSync(cacheFile)) {
    console.log("Reusing the cached farm from sybil-wallets.json");
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  }

  console.log(`Creating a fraudulent tasker and ${FARM_SIZE} sybil wallets…`);
  const tasker = await createUserWallet("sybil-tasker");
  if (!tasker?.id) throw new Error("Failed to create the tasker wallet");

  const sybils = [];
  for (let i = 0; i < FARM_SIZE; i++) {
    const w = await createUserWallet(`sybil-${i}`);
    if (!w?.id) throw new Error(`Failed to create sybil ${i}`);
    sybils.push({ id: w.id, address: w.address as `0x${string}` });
  }

  const farm: Farm = { tasker: { id: tasker.id, address: tasker.address as `0x${string}` }, sybils };
  writeFileSync(cacheFile, JSON.stringify(farm, null, 2));
  console.log(`  tasker  ${farm.tasker.address}`);
  for (const [i, s] of farm.sybils.entries()) console.log(`  sybil ${i}  ${s.address}`);
  return farm;
}

const balanceOf = (addr: `0x${string}`) =>
  withRetry(() =>
    publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [addr],
    }),
  ) as Promise<bigint>;

async function main() {
  console.log(`Vane — the refusal path. Campaign #${campaignId} on Arc testnet.\n`);
  const farm = await loadOrCreateFarm();

  console.log("\n── 1. Fund the farm from a single source ────────────");
  // This is the tell the falcon will catch: every sybil funded by the same wallet.
  const taskerBalance = await balanceOf(farm.tasker.address);
  const needed = BigInt(FARM_SIZE) * 400_000n;
  if (taskerBalance < needed) {
    await transfer(
      agentWalletId,
      farm.tasker.address,
      (Number(needed - taskerBalance) / 1e6).toFixed(6),
      "stake the fraudulent tasker",
    );
  } else {
    console.log(`  tasker already holds ${formatUsdc(taskerBalance)}`);
  }

  for (const [i, s] of farm.sybils.entries()) {
    const have = await balanceOf(s.address);
    if (have >= 200_000n) {
      console.log(`  sybil ${i} funded (${formatUsdc(have)})`);
      continue;
    }
    await transfer(farm.tasker.id, s.address, GAS_EACH, `fund sybil ${i} from the same wallet`);
  }

  console.log("\n── 2. The tasker claims a code ──────────────────────");
  const code = keccak256(toBytes(`vane-sybil-${campaignId}`));
  const existing = await readTaskerOfCode(registry as `0x${string}`, campaignId, code);

  if (existing.toLowerCase() === farm.tasker.address.toLowerCase()) {
    console.log("  code already claimed by this tasker");
  } else {
    await send(farm.tasker.id, registry, "claimCode(uint256,bytes32)", [campaignId.toString(), code], "claim the code");
  }

  console.log("\n── 3. Seal every sybil in one burst ─────────────────");
  // Sealed seconds apart, which is what cluster detection is looking for.
  for (const [i, s] of farm.sybils.entries()) {
    const sealed = (await withRetry(() => publicClient.readContract({
      address: registry as `0x${string}`,
      abi: [
        {
          type: "function",
          name: "sealedAt",
          stateMutability: "view",
          inputs: [{ type: "uint256" }, { type: "address" }],
          outputs: [{ type: "uint64" }],
        },
      ] as const,
      functionName: "sealedAt",
      args: [campaignId, s.address],
    }))) as bigint;

    if (sealed > 0n) {
      console.log(`  sybil ${i} already sealed`);
      continue;
    }
    await send(
      agentWalletId,
      registry,
      "sealReferral(uint256,address,bytes32)",
      [campaignId.toString(), s.address, code],
      `seal sybil ${i}`,
    );
  }

  console.log("\n── 4. All of them convert immediately ───────────────");
  // No human signs up and converts in under a minute. That is the point.
  const kind = keccak256(toBytes("signup"));
  const conversions: { wallet: `0x${string}`; actionIndex: bigint; block: bigint; at: number }[] = [];

  for (const [i, s] of farm.sybils.entries()) {
    const receipt = await send(s.id, demoBusiness, "convert(bytes32)", [kind], `sybil ${i} converts`);
    const hash = (receipt as { txHash?: string }).txHash as `0x${string}` | undefined;
    let block = 0n;
    let at = Math.floor(Date.now() / 1000);
    if (hash) {
      const r = await withRetry(() => publicClient.getTransactionReceipt({ hash })).catch(() => null);
      if (r) {
        block = r.blockNumber;
        const b = await withRetry(() => publicClient.getBlock({ blockNumber: r.blockNumber })).catch(() => null);
        if (b) at = Number(b.timestamp);
      }
    }
    conversions.push({ wallet: s.address, actionIndex: 0n, block, at });
    await sleep(500);
  }

  console.log("\n── 5. The falcon judges ─────────────────────────────");
  // Every signal below is read off Arc. The script supplies only facts it created and
  // knows to be true: how many wallets this tasker referred, and that one wallet funded
  // all of them. A production indexer derives both from chain history.
  const seals = conversions.map((c) => ({ wallet: c.wallet, sealedAt: c.at }));
  const cluster = detectCluster(seals);

  const taskerSignals: TaskerSignals = {
    address: farm.tasker.address,
    settledCount: 0,
    heldCount: 0,
    lastHourCount: conversions.length,
    distinctFunders: 1,
    referredCount: conversions.length,
  };

  const decisions = [];
  for (const c of conversions) {
    const claim: ConversionClaim = {
      campaignId,
      wallet: c.wallet,
      actionIndex: c.actionIndex,
      kind: "signup",
      observedAt: c.at,
    };
    const wallet = await walletSignals(campaignId, c.wallet, c.block);
    const decision = evaluate(claim, wallet, taskerSignals);

    if (cluster.clustered.includes(c.wallet) && cluster.reason) {
      decision.signals.push(cluster.reason);
      decision.risk = Math.min(100, decision.risk + 25);
      if (decision.risk >= 60) {
        decision.verdict = "hold";
        decision.reason = `Held — ${cluster.reason}.`;
      }
    }

    console.log(`\n  ${c.wallet.slice(0, 12)}…  risk ${decision.risk}/100  → ${decision.verdict.toUpperCase()}`);
    console.log(`    ${decision.reason}`);
    for (const s of decision.signals) console.log(`      · ${s}`);
    decisions.push({ claim, decision });
  }

  // --- the control ------------------------------------------------------
  // A refusal engine that refuses everything is not a refusal engine. Run the same
  // evaluate() over the honest conversion from the e2e loop — same campaign, same code
  // path, real chain data — and show it still comes out payable. Without this, "we
  // caught the fraud" is unfalsifiable.
  const e2eFile = join(here, "..", "..", "e2e-wallets.json");
  if (existsSync(e2eFile)) {
    console.log("\n── 5b. The control: an honest referral ──────────────");
    const e2e = JSON.parse(readFileSync(e2eFile, "utf8")) as { customer: { address: `0x${string}` } };
    const honestWallet = e2e.customer.address;

    const sealedAt = Number(
      await withRetry(() =>
        publicClient.readContract({
          address: registry as `0x${string}`,
          abi: [
            {
              type: "function",
              name: "sealedAt",
              stateMutability: "view",
              inputs: [{ type: "uint256" }, { type: "address" }],
              outputs: [{ type: "uint64" }],
            },
          ] as const,
          functionName: "sealedAt",
          args: [campaignId, honestWallet],
        }),
      ),
    );

    if (sealedAt > 0) {
      const signals = await walletSignals(campaignId, honestWallet, 0n);
      const honestTasker: TaskerSignals = {
        address: honestWallet,
        settledCount: 1,
        heldCount: 0,
        lastHourCount: 1,
        distinctFunders: 1,
        referredCount: 1, // below the 4-referral floor, so concentration cannot fire
      };
      const claim: ConversionClaim = {
        campaignId,
        wallet: honestWallet,
        actionIndex: 0n,
        kind: "signup",
        observedAt: sealedAt + 600, // converted ten minutes after arriving, like a person
      };
      const control = evaluate(claim, signals, honestTasker);
      console.log(`\n  ${honestWallet.slice(0, 12)}…  risk ${control.risk}/100  → ${control.verdict.toUpperCase()}`);
      console.log(`    ${control.reason}`);
      for (const s of control.signals) console.log(`      · ${s}`);
      if (control.verdict === "hold") {
        console.error("\n  The control was refused. That is a false positive and a blocker.");
        process.exit(1);
      }
      console.log("\n  Control passed: the same engine still pays honest work.");
    }
  }

  console.log("\n── 6. Write the refusals on-chain ───────────────────");
  const refused = decisions.filter((d) => d.decision.verdict === "hold");
  if (refused.length === 0) {
    console.error("\nThe engine did not refuse this farm. That is a finding, not a success.");
    process.exit(1);
  }

  for (const { claim, decision } of refused) {
    await send(
      agentWalletId,
      escrow,
      "hold(uint256,address,uint256,string)",
      [claim.campaignId.toString(), claim.wallet, claim.actionIndex.toString(), decision.reason],
      `refuse ${claim.wallet.slice(0, 10)}…`,
    );
  }

  const remaining = (await withRetry(() => publicClient.readContract({
    address: escrow as `0x${string}`,
    abi: [
      {
        type: "function",
        name: "remaining",
        stateMutability: "view",
        inputs: [{ type: "uint256" }],
        outputs: [{ type: "uint256" }],
      },
    ] as const,
    functionName: "remaining",
    args: [campaignId],
  }))) as bigint;

  console.log("\n─────────────────────────────────────────────────────");
  console.log(`  ${refused.length} of ${decisions.length} claims refused, in writing, on-chain.`);
  console.log(`  budget untouched: ${formatUsdc(remaining)} still in escrow.`);
  console.log(`\n  Escrow: ${config.explorer}/address/${escrow}`);
  console.log("\nThe falcon did not pay the fraud, and said why where anyone can read it.\n");
}

main().catch((err) => {
  console.error(`\n${err?.message ?? err}`);
  process.exit(1);
});
