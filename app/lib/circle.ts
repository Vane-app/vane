import { randomUUID, createHash } from "node:crypto";

/**
 * Circle Wallets — server side.
 *
 * Creates a developer-controlled wallet per user during sign-up, so onboarding
 * stays seedless and invisible. When Circle credentials aren't configured yet,
 * it returns a deterministic demo wallet so the whole flow still works — the app
 * never blocks on secrets it doesn't have.
 *
 * Real path uses @circle-fin/developer-controlled-wallets with an SCA account
 * (required for Paymaster gas sponsorship on Arc).
 */

const CONFIGURED = Boolean(
  process.env.CIRCLE_API_KEY && process.env.ENTITY_SECRET && process.env.CIRCLE_WALLET_SET_ID,
);

export const circleConfigured = CONFIGURED;

export interface Wallet {
  walletId: string;
  address: string;
  demo: boolean;
}

/** A deterministic 0x address from a seed, for the demo fallback. */
function demoAddress(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `0x${h.slice(0, 40)}`;
}

export async function createUserWallet(refId: string): Promise<Wallet> {
  if (!CONFIGURED) {
    return { walletId: `demo-${refId.slice(0, 8)}`, address: demoAddress(refId), demo: true };
  }

  const { initiateDeveloperControlledWalletsClient } = await import(
    "@circle-fin/developer-controlled-wallets"
  );
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.ENTITY_SECRET!,
  });

  const res = await client.createWallets({
    walletSetId: process.env.CIRCLE_WALLET_SET_ID!,
    blockchains: [(process.env.CIRCLE_BLOCKCHAIN ?? "ARC-TESTNET") as never],
    count: 1,
    accountType: "SCA",
    metadata: [{ refId }],
    idempotencyKey: randomUUID(),
  });

  const w = res.data?.wallets?.[0];
  return {
    walletId: w?.id ?? `pending-${refId.slice(0, 8)}`,
    address: w?.address ?? demoAddress(refId),
    demo: false,
  };
}
