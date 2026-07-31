import { randomUUID, createHash } from "node:crypto";

/**
 * Circle Wallets — developer-controlled. **Not for users.**
 *
 * Vane controls these, which makes them the wrong tool for a tasker's or a business's
 * money: we must never be able to move it. Users get user-controlled MPC wallets
 * instead — see ./circle-user.ts.
 *
 * This module is kept for Vane's own operational wallets, where developer control is
 * correct because the money is Vane's and the falcon must act with no human in the
 * loop. Do not call it from a signup path.
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
