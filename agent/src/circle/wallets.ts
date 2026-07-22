import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { randomUUID } from "node:crypto";
import { config, USDC_ADDRESS } from "../config.js";

/**
 * Circle Developer-Controlled Wallets.
 *
 * This is what makes Vane's onboarding invisible. A business or tasker signs up with
 * an email; Circle creates and custodies the key; the user never sees a seed phrase,
 * never installs an extension, and never learns the word "wallet" unless they want to.
 * Combined with USDC-denominated gas on Arc, a non-crypto user can complete the entire
 * flow — fund a campaign, earn, cash out — without touching a crypto concept.
 */

let client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

export function wallets() {
  if (!client) {
    if (!config.circle.apiKey || !config.circle.entitySecret) {
      throw new Error(
        "CIRCLE_API_KEY and ENTITY_SECRET are required. Create them at console.circle.com, " +
          "then register the entity secret ciphertext before first use.",
      );
    }
    client = initiateDeveloperControlledWalletsClient({
      apiKey: config.circle.apiKey,
      entitySecret: config.circle.entitySecret,
    });
  }
  return client;
}

/** One wallet set holds every Vane user wallet. Run once, keep the id. */
export async function createWalletSet(name = "Vane Users") {
  const res = await wallets().createWalletSet({ name, idempotencyKey: randomUUID() });
  return res.data?.walletSet;
}

/**
 * Create a wallet for a new user, silently, during onboarding.
 * `refId` lets us map the wallet back to our own user record.
 */
export async function createUserWallet(refId: string, walletSetId = config.circle.walletSetId) {
  if (!walletSetId) throw new Error("CIRCLE_WALLET_SET_ID is not set — run createWalletSet first.");
  const res = await wallets().createWallets({
    walletSetId,
    blockchains: [config.circleBlockchain as never],
    count: 1,
    accountType: "SCA", // smart contract account — required for Paymaster gas sponsorship
    metadata: [{ refId }], // maps the wallet back to our own user record
    idempotencyKey: randomUUID(),
  });
  return res.data?.wallets?.[0];
}

export async function getBalance(walletId: string) {
  const res = await wallets().getWalletTokenBalance({ id: walletId });
  const usdc = res.data?.tokenBalances?.find(
    (b) => b.token?.tokenAddress?.toLowerCase() === USDC_ADDRESS.toLowerCase() || b.token?.symbol === "USDC",
  );
  return { raw: res.data?.tokenBalances ?? [], usdc: usdc?.amount ?? "0" };
}

/**
 * Call a contract function from a Circle-custodied wallet.
 * Every write in Vane goes through here, including the agent's own settlements.
 */
export async function executeContract(params: {
  walletId: string;
  contractAddress: `0x${string}`;
  abiFunctionSignature: string;
  abiParameters: unknown[];
  /** Reusing an idempotency key makes a retry safe — it will never double-pay. */
  idempotencyKey?: string;
}) {
  const res = await wallets().createContractExecutionTransaction({
    walletId: params.walletId,
    contractAddress: params.contractAddress,
    abiFunctionSignature: params.abiFunctionSignature,
    abiParameters: params.abiParameters as never,
    idempotencyKey: params.idempotencyKey ?? randomUUID(),
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return res.data;
}

/** Poll a transaction to a terminal state. */
export async function waitForTransaction(id: string, timeoutMs = 90_000) {
  const terminal = new Set(["COMPLETE", "FAILED", "DENIED", "CANCELLED"]);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await wallets().getTransaction({ id });
    const state = res.data?.transaction?.state;
    if (state && terminal.has(state)) return res.data?.transaction;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`Transaction ${id} did not settle within ${timeoutMs}ms`);
}

/** Direct USDC transfer — used for tasker cash-out. */
export async function transferUsdc(params: {
  walletId: string;
  to: `0x${string}`;
  /** 6-decimal display amount, e.g. "2.00" */
  amount: string;
  tokenId: string;
}) {
  const res = await wallets().createTransaction({
    walletId: params.walletId,
    tokenId: params.tokenId,
    destinationAddress: params.to,
    amount: [params.amount],
    idempotencyKey: randomUUID(),
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return res.data;
}
