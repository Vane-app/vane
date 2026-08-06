import "./env.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes, erc20Abi } from "viem";
import { config, USDC_ADDRESS, formatUsdc } from "./config.js";
import { publicClient, withRetry } from "./signals.js";
import { createUserWallet, executeContract, waitForTransaction, transferUsdc, getBalance } from "./circle/wallets.js";

/**
 * A referred customer converts.
 *
 *   npm run convert -w @vane/agent -- <refCode> [campaignId]
 *
 * This is the one step of the loop that nobody at Vane performs in real life: someone
 * clicks a promoter's link and then does something valuable on the business's own
 * product. Here that is `DemoBusiness.convert()`, which emits a public event and calls
 * the registry — the same path a real integrated business would take.
 *
 * It exists because closing the loop through the app otherwise stalls: a business can
 * post and a promoter can take, but without a customer there is nothing for the falcon
 * to judge. Everything before this is done by real people through the product; this
 * stands in for the stranger who arrives from a shared link.
 *
 * The wallet is sealed to the referral code *before* it converts, which is the whole
 * basis of the attribution guarantee — the seal is one-shot and cannot be rewritten
 * afterwards.
 */

const here = dirname(fileURLToPath(import.meta.url));
const cacheFile = join(here, "..", "..", "convert-wallets.json");

function need(key: string, value: string | undefined): string {
  if (!value) throw new Error(`${key} is not set in .env`);
  return value;
}

const registry = need("VANE_REGISTRY_ADDRESS", config.registryAddress);
const demoBusiness = need("VANE_DEMO_BUSINESS_ADDRESS", process.env.VANE_DEMO_BUSINESS_ADDRESS);
const agentWalletId = need("CIRCLE_AGENT_WALLET_ID", config.circle.agentWalletId);

const refCode = process.argv[2];
const campaignArg = process.argv[3];

if (!refCode) {
  console.error(
    "\nUsage: npm run convert -w @vane/agent -- <refCode> [campaignId]\n\n" +
      "The refCode is the one in the promoter's link: vane.money/r/<refCode>\n",
  );
  process.exit(1);
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

const balanceOf = (addr: `0x${string}`) =>
  withRetry(() =>
    publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [addr] }),
  ) as Promise<bigint>;

async function main() {
  console.log(`\nA referred customer arrives via ${refCode}\n`);

  // Reuse a customer across runs so the falcon sees a wallet with some history,
  // rather than a fresh one it would rightly be suspicious of.
  let customer: { id: string; address: `0x${string}` };
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};

  if (cache[refCode]) {
    customer = cache[refCode];
    console.log(`  reusing customer ${customer.address}`);
  } else {
    const w = await createUserWallet(`customer-${refCode}`);
    if (!w?.id) throw new Error("Could not create a customer wallet");
    customer = { id: w.id, address: w.address as `0x${string}` };
    cache[refCode] = customer;
    writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
    console.log(`  new customer ${customer.address}`);
  }

  // Gas is USDC on Arc, and a new wallet has none.
  const balance = await balanceOf(customer.address);
  if (balance < BigInt(200_000)) {
    process.stdout.write(`  funding for gas … `);
    const { raw } = await getBalance(agentWalletId);
    const token = (raw as { token?: { id?: string; symbol?: string; tokenAddress?: string } }[]).find(
      (b) => b.token?.tokenAddress?.toLowerCase() === USDC_ADDRESS.toLowerCase() || b.token?.symbol === "USDC",
    );
    if (!token?.token?.id) throw new Error("No USDC on the falcon's wallet");
    const tx = await transferUsdc({
      walletId: agentWalletId,
      to: customer.address,
      amount: "0.40",
      tokenId: token.token.id,
    });
    await waitForTransaction((tx as { id: string }).id);
    console.log("ok");
  } else {
    console.log(`  customer holds ${formatUsdc(balance)}`);
  }

  // The campaign id on-chain. Given explicitly, or read from the registry by code.
  const campaignId = campaignArg ? BigInt(campaignArg) : await campaignForCode();

  console.log(`\n  campaign #${campaignId}`);

  // Seal first. This is the attribution guarantee: one-shot, before any conversion,
  // and unrewritable afterwards.
  const alreadySealed = Number(
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
        args: [campaignId, customer.address],
      }),
    ),
  );

  if (alreadySealed > 0) {
    console.log("  already attributed to this promoter");
  } else {
    await send(
      agentWalletId,
      registry,
      "sealReferral(uint256,address,bytes32)",
      [campaignId.toString(), customer.address, keccak256(toBytes(refCode))],
      "seal the customer to the promoter",
    );
  }

  await send(
    agentWalletId,
    demoBusiness,
    "setCampaign(uint256)",
    [campaignId.toString()],
    "point the product at this campaign",
  );

  await send(customer.id, demoBusiness, "convert(bytes32)", [keccak256(toBytes("signup"))], "customer converts");

  console.log(
    `\n  Done. The falcon should pick this up and decide within a few seconds.\n` +
      `  Watch it:  npm run agent\n` +
      `  Explorer:  ${config.explorer}/address/${demoBusiness}\n`,
  );
}

/** Which campaign a referral code belongs to, read off the registry. */
async function campaignForCode(): Promise<bigint> {
  throw new Error(
    "Pass the on-chain campaign id as the second argument — the registry indexes codes per campaign, " +
      "so it cannot be derived from the code alone.",
  );
}

main().catch((err) => {
  console.error(`\n${err?.message ?? err}\n`);
  process.exit(1);
});
