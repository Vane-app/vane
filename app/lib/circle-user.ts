import { randomUUID } from "node:crypto";

/**
 * Circle Wallets — user-controlled.
 *
 * This is the custody model Vane ships. Taskers and businesses hold their own keys
 * through Circle's MPC wallets: the keyshare stays on the user's device and never
 * reaches our servers, and every sensitive operation needs the user's explicit
 * approval through a challenge. Vane cannot move a user's money, which is the whole
 * point of a marketplace that claims to have removed the middleman.
 *
 * The falcon's own operating wallet stays developer-controlled (see ./circle.ts) —
 * it must act with no human in the loop, and it holds nothing but Vane's own money.
 *
 * The flow, which is not obvious the first time:
 *   1. server  createUser(userId)                        — once per person
 *   2. server  createUserToken(userId)                   — 60-minute session
 *   3. server  createUserPinWithWallets(...)             — returns a challengeId
 *   4. browser sdk.execute(challengeId)                  — user sets a PIN, wallet appears
 *
 * The server never sees the PIN and cannot complete step 4 on the user's behalf.
 */

const CONFIGURED = Boolean(process.env.CIRCLE_API_KEY && process.env.CIRCLE_APP_ID);

export const userWalletsConfigured = CONFIGURED;
export const circleAppId = process.env.CIRCLE_APP_ID ?? "";

const BLOCKCHAIN = process.env.CIRCLE_BLOCKCHAIN ?? "ARC-TESTNET";

/**
 * EOA rather than SCA.
 *
 * Circle Gateway — the rail behind Nanopayments — requires an externally owned
 * account, and gas-free sub-cent payouts matter more to Vane than the Paymaster
 * sponsorship SCA would unlock. Arc Testnet supports both; this is a deliberate pick,
 * not a default. Changing it later means new wallets, so it is deliberate here.
 */
const ACCOUNT_TYPE = "EOA" as const;

async function client() {
  const { initiateUserControlledWalletsClient } = await import("@circle-fin/user-controlled-wallets");
  return initiateUserControlledWalletsClient({ apiKey: process.env.CIRCLE_API_KEY! });
}

export interface WalletSession {
  userToken: string;
  encryptionKey: string;
  appId: string;
  /** True once the user has been through the PIN challenge and has a wallet. */
  ready: boolean;
  address?: string;
}

/**
 * Start (or resume) a wallet session for one of our users.
 * Safe to call repeatedly — Circle rejects a duplicate user, which we treat as fine.
 */
export async function startSession(userId: string): Promise<WalletSession> {
  const c = await client();

  try {
    await c.createUser({ userId });
  } catch {
    // Already exists. The only way to know is to try, and a second signup is normal.
  }

  const tokenRes = await c.createUserToken({ userId });
  const userToken = tokenRes.data?.userToken;
  const encryptionKey = tokenRes.data?.encryptionKey;
  if (!userToken || !encryptionKey) throw new Error("Circle did not return a user session token");

  const { ready, address } = await walletState(userToken);
  return { userToken, encryptionKey, appId: circleAppId, ready, address };
}

/** Whether this user already holds a wallet, and its address if so. */
export async function walletState(userToken: string): Promise<{ ready: boolean; address?: string }> {
  const c = await client();
  const res = await c.listWallets({ userToken }).catch(() => null);
  const wallet = res?.data?.wallets?.[0];
  return { ready: Boolean(wallet?.address), address: wallet?.address };
}

/**
 * Ask Circle for a wallet-creation challenge.
 * Returns a challengeId the browser SDK must execute; the user sets their PIN there.
 */
export async function createWalletChallenge(userToken: string): Promise<string> {
  const c = await client();
  const res = await c.createUserPinWithWallets({
    userToken,
    accountType: ACCOUNT_TYPE,
    blockchains: [BLOCKCHAIN as never],
    idempotencyKey: randomUUID(),
  });
  const challengeId = res.data?.challengeId;
  if (!challengeId) throw new Error("Circle did not return a wallet-creation challenge");
  return challengeId;
}

/**
 * Ask Circle for a contract-call challenge — a tasker taking a campaign, a business
 * funding one. The user approves it with their PIN; Vane can prepare the call but
 * cannot authorise it.
 */
export async function createContractChallenge(params: {
  userToken: string;
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: unknown[];
}): Promise<string> {
  const c = await client();
  const res = await c.createUserTransactionContractExecutionChallenge({
    userToken: params.userToken,
    walletId: params.walletId,
    contractAddress: params.contractAddress,
    abiFunctionSignature: params.abiFunctionSignature,
    abiParameters: params.abiParameters as never,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  const challengeId = res.data?.challengeId;
  if (!challengeId) throw new Error("Circle did not return a transaction challenge");
  return challengeId;
}
