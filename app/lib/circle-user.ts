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
 * Circle Gateway — the rail behind Nanopayments — requires an externally owned account,
 * and gas-free sub-cent payouts are on Vane's path: streaming rev-share pays fractions
 * of a cent, which only works if the transfer costs less than the transfer. Arc Testnet
 * supports both account types, so this is a deliberate pick rather than a default, and
 * changing it later would mean new wallets for everybody.
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
  /** Circle's id for the wallet — required to address any transaction to it. */
  walletId?: string;
}

/**
 * Start (or resume) a wallet session for one of our users.
 * Safe to call repeatedly — Circle rejects a duplicate user, which we treat as fine.
 */
export async function startSession(userId: string): Promise<WalletSession> {
  const c = await client();

  /**
   * Use the Circle user the person signed in as, when there is one.
   *
   * Signing in with Circle's email OTP already creates a Circle user and proves who it
   * belongs to. Minting a second one keyed on Vane's own id would give the same person
   * two identities at Circle — the one that passed the OTP, and the one that owns their
   * wallet — so recovering a wallet would have nothing to do with logging in. Falls
   * back to Vane's id for accounts made before Circle became the front door.
   */
  const { getUser } = await import("./store");
  const account = await getUser(userId).catch(() => undefined);
  const circleId = account?.circleUserId ?? userId;

  /**
   * Only create the Circle user when there might not be one.
   *
   * This ran on every single request that touched a wallet — taking a campaign,
   * converting, funding — and for anyone who already had a wallet it was a round trip
   * to Circle whose only possible outcome was a rejection we ignore. Three sequential
   * calls where two would do, on the exact paths where someone is watching a button
   * and wondering whether they pressed it.
   *
   * An address on the account means Circle already knows this person.
   */
  if (!account?.walletAddress) {
    try {
      await c.createUser({ userId: circleId });
    } catch {
      // Already exists. The only way to know is to try, and a second signup is normal.
    }
  }

  const tokenRes = await c.createUserToken({ userId: circleId });
  const userToken = tokenRes.data?.userToken;
  const encryptionKey = tokenRes.data?.encryptionKey;
  if (!userToken || !encryptionKey) throw new Error("Circle did not return a user session token");

  /**
   * Skip listing the wallets when we already know them.
   *
   * The address and id are mirrored on the account, so asking Circle to confirm what we
   * already wrote down costs a round trip and can only agree. Anyone mid-onboarding —
   * where the answer genuinely changes — still gets the live read.
   */
  if (account?.walletAddress && account?.walletId) {
    return {
      userToken,
      encryptionKey,
      appId: circleAppId,
      ready: true,
      address: account.walletAddress,
      walletId: account.walletId,
    };
  }

  const { ready, address, walletId } = await walletState(userToken);
  return { userToken, encryptionKey, appId: circleAppId, ready, address, walletId };
}

/** Whether this user already holds a wallet, and its address if so. */
export async function walletState(
  userToken: string,
): Promise<{ ready: boolean; address?: string; walletId?: string }> {
  const c = await client();
  const res = await c.listWallets({ userToken }).catch(() => null);
  const wallet = res?.data?.wallets?.[0];
  // The id matters as much as the address: every prepared transaction is addressed to
  // a walletId, so a user whose id we never stored cannot sign anything at all.
  return { ready: Boolean(wallet?.address), address: wallet?.address, walletId: wallet?.id };
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
