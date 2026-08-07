import "./env.js";
import { erc20Abi } from "viem";
import { eq, isNull, like, or } from "drizzle-orm";
import { config, USDC_ADDRESS, formatUsdc } from "./config.js";
import { publicClient, withRetry } from "./signals.js";
import { executeContract, waitForTransaction } from "./circle/wallets.js";

/**
 * Put campaigns in the marketplace that can actually pay someone.
 *
 *   npm run seed:live -w @vane/agent
 *
 * Every campaign in the marketplace was decoration. Twelve seeded ones with no owner
 * and no escrow, plus nine left behind by the smoke test running against production.
 * Someone could browse, take one, get a referral link — and nothing behind it could
 * ever settle, because there was no funded campaign on Arc to settle from. A person
 * testing this would do everything right and reach a dead end with no way to tell why.
 *
 * So: clear the decoration, and fund a small number for real. The falcon owns them —
 * it is Vane's own money, on testnet, at a couple of dollars each — and they behave
 * exactly like a business's campaign because they are one: budget locked in
 * VaneEscrow, a reporter authorised, results settled by the same agent reading the
 * same events.
 *
 * The point is that someone who takes one and converts actually gets paid.
 */

const ESCROW = need("VANE_ESCROW_ADDRESS", config.escrowAddress);
const REGISTRY = need("VANE_REGISTRY_ADDRESS", config.registryAddress);
const AGENT_WALLET = need("CIRCLE_AGENT_WALLET_ID", config.circle.agentWalletId);
const DEMO_BUSINESS = need("VANE_DEMO_BUSINESS_ADDRESS", process.env.VANE_DEMO_BUSINESS_ADDRESS);

function need(key: string, v: string | undefined): string {
  if (!v) throw new Error(`${key} is not set in .env`);
  return v;
}

/** Small, real, and varied enough to show the shapes a campaign can take. */
const CAMPAIGNS = [
  {
    business: "Nova Exchange",
    blurb: "Someone you refer connects a wallet and makes their first swap",
    industry: "Trading",
    colour: "#c2703f",
    rewardPerAction: 500_000, // $0.50
    budget: 4_000_000, // $4 — eight results
    effort: "quick",
  },
  {
    business: "Harbour",
    blurb: "A referred wallet makes its first deposit of any size",
    industry: "Banking",
    colour: "#7d5bb0",
    rewardPerAction: 750_000, // $0.75
    budget: 3_000_000, // $3 — four results
    effort: "medium",
  },
] as const;

async function send(to: string, signature: string, args: unknown[], label: string) {
  process.stdout.write(`  ${label} … `);
  const tx = await executeContract({
    walletId: AGENT_WALLET,
    contractAddress: to as `0x${string}`,
    abiFunctionSignature: signature,
    abiParameters: args,
  });
  const id = (tx as { id?: string })?.id;
  if (!id) throw new Error(`${label}: no transaction id`);
  const r = (await waitForTransaction(id)) as { state?: string; txHash?: string; errorReason?: string };
  if (r?.state !== "COMPLETE") throw new Error(`${label} ${r?.state}: ${r?.errorReason ?? ""}`);
  console.log(`ok  ${r.txHash ?? ""}`);
  return r;
}

async function main() {
  const { db, schema } = await import("../../app/lib/db/client.js");
  if (!db) throw new Error("DATABASE_URL is not set — nothing to seed into.");

  console.log("\nClearing campaigns that could never pay anyone\n");

  // Anything with no owner (the bundled sample set) or left by the smoke test.
  const removed = await db
    .delete(schema.campaigns)
    .where(or(isNull(schema.campaigns.ownerId), like(schema.campaigns.business, "SmokeCo%")))
    .returning({ id: schema.campaigns.id });
  console.log(`  removed ${removed.length} placeholder campaigns`);

  const balance = (await withRetry(() =>
    publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [process.env.VANE_AGENT_ADDRESS as `0x${string}`],
    }),
  )) as bigint;

  const needed = CAMPAIGNS.reduce((n, c) => n + c.budget, 0);
  console.log(`  falcon holds ${formatUsdc(balance)}, funding ${formatUsdc(BigInt(needed))}\n`);
  if (balance < BigInt(needed) + BigInt(1_000_000)) {
    throw new Error("Not enough USDC to fund these and still pay gas. Top up at faucet.circle.com.");
  }

  for (const c of CAMPAIGNS) {
    console.log(`${c.business} — ${formatUsdc(BigInt(c.rewardPerAction))} per result`);

    const chainId = Number(
      await withRetry(() =>
        publicClient.readContract({
          address: ESCROW as `0x${string}`,
          abi: [
            { type: "function", name: "nextCampaignId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
          ] as const,
          functionName: "nextCampaignId",
        }),
      ),
    );

    await send(USDC_ADDRESS, "approve(address,uint256)", [ESCROW, String(c.budget)], "approve the vault");
    await send(
      ESCROW,
      "createCampaign(uint128,uint96,uint64,uint64)",
      [String(c.budget), String(c.rewardPerAction), "604800", "0"],
      `lock ${formatUsdc(BigInt(c.budget))} in escrow`,
    );
    // Without this the campaign funds and then cannot receive a single result.
    await send(
      REGISTRY,
      "setReporter(uint256,address,bool)",
      [String(chainId), DEMO_BUSINESS, true],
      "authorise result reporting",
    );

    const [row] = await db
      .insert(schema.campaigns)
      .values({
        ownerId: null, // Vane's own, so no business dashboard claims it
        business: c.business,
        blurb: c.blurb,
        initial: c.business[0],
        colour: c.colour,
        web3: true,
        kind: "signup",
        taskType: "referral",
        industry: c.industry,
        rewardPerAction: c.rewardPerAction,
        budget: c.budget,
        endsAt: Math.floor(Date.now() / 1000) + 7 * 86_400,
        status: "active",
        effort: c.effort,
        escrowCampaignId: chainId,
      })
      .returning();

    console.log(`  listed as #${row.id}, escrow campaign #${chainId}\n`);
  }

  console.log("Done. These can be taken, converted and settled for real.");
  console.log(`Escrow: ${config.explorer}/address/${ESCROW}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n${err?.message ?? err}\n`);
  process.exit(1);
});
