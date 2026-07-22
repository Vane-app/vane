import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

/**
 * Circle Smart Contract Platform.
 *
 * Vane deploys and reads its vault and registry through SCP rather than a raw
 * signer, so contract lifecycle, ABI storage and read access live in the same
 * place as the wallets that call them. Reads are free and need no gas wallet;
 * writes always go through the Wallets client (see ./wallets.ts).
 */

let client: ReturnType<typeof initiateSmartContractPlatformClient> | null = null;

export function scp() {
  if (!client) {
    if (!config.circle.apiKey || !config.circle.entitySecret) {
      throw new Error("CIRCLE_API_KEY and ENTITY_SECRET are required for the Smart Contract Platform.");
    }
    client = initiateSmartContractPlatformClient({
      apiKey: config.circle.apiKey,
      entitySecret: config.circle.entitySecret,
    });
  }
  return client;
}

/** Deploy a compiled contract. `bytecode` must carry the 0x prefix. */
export async function deployContract(params: {
  name: string;
  description?: string;
  walletId: string;
  abiJson: string;
  bytecode: string;
  constructorParameters?: unknown[];
}) {
  const res = await scp().deployContract({
    name: params.name,
    description: params.description,
    walletId: params.walletId,
    blockchain: config.circleBlockchain as never,
    abiJson: params.abiJson,
    bytecode: params.bytecode,
    constructorParameters: params.constructorParameters as never,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  return res.data;
}

/** Read a view/pure function. No gas, no wallet, no signature. */
export async function read(params: {
  address: `0x${string}`;
  abiFunctionSignature: string;
  abiParameters?: unknown[];
}) {
  const res = await scp().queryContract({
    address: params.address,
    blockchain: config.circleBlockchain as never,
    abiFunctionSignature: params.abiFunctionSignature,
    abiParameters: (params.abiParameters ?? []) as never,
  });
  return res.data?.outputValues;
}

/** Convenience readers for the escrow, used by the dashboard and the agent. */
export const escrowReads = {
  async remaining(campaignId: bigint) {
    if (!config.escrowAddress) throw new Error("VANE_ESCROW_ADDRESS is not set.");
    return read({
      address: config.escrowAddress,
      abiFunctionSignature: "remaining(uint256)",
      abiParameters: [campaignId.toString()],
    });
  },
  async campaign(campaignId: bigint) {
    if (!config.escrowAddress) throw new Error("VANE_ESCROW_ADDRESS is not set.");
    return read({
      address: config.escrowAddress,
      abiFunctionSignature: "campaigns(uint256)",
      abiParameters: [campaignId.toString()],
    });
  },
};
