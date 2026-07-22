import { defineChain } from "viem";

/**
 * Arc — Circle's stablecoin-native L1. USDC is the gas token.
 *
 * Dual-interface asset model, and the single easiest thing to get wrong:
 *   - native view  : 18 decimals, used for gas and `msg.value` only
 *   - ERC-20 view  : 6 decimals, used for transfers, approvals and anything shown to a human
 * Both views are the *same* pool of funds. Never add them together.
 * Vane keeps every amount in the 6-decimal ERC-20 view except raw gas maths.
 */
export const ARC_TESTNET_ID = 5042002;

export const arcTestnet = defineChain({
  id: ARC_TESTNET_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network"],
      webSocket: [process.env.ARC_WS_URL ?? "wss://rpc.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

/** USDC ERC-20 on Arc testnet. 6 decimals in this view. */
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const USDC_DECIMALS = 6;

/** CCTP domain for Arc — used when we add cross-chain campaign funding. */
export const ARC_CCTP_DOMAIN = 26;

export const config = {
  chain: arcTestnet,
  rpcUrl: process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network",
  explorer: "https://testnet.arcscan.app",
  faucet: "https://faucet.circle.com",

  escrowAddress: process.env.VANE_ESCROW_ADDRESS as `0x${string}` | undefined,
  registryAddress: process.env.VANE_REGISTRY_ADDRESS as `0x${string}` | undefined,

  circle: {
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.ENTITY_SECRET,
    walletSetId: process.env.CIRCLE_WALLET_SET_ID,
    agentWalletId: process.env.CIRCLE_AGENT_WALLET_ID,
    escrowContractId: process.env.CIRCLE_ESCROW_CONTRACT_ID,
    registryContractId: process.env.CIRCLE_REGISTRY_CONTRACT_ID,
  },

  /** Circle's blockchain identifier for Arc testnet in the Wallets/SCP APIs. */
  circleBlockchain: process.env.CIRCLE_BLOCKCHAIN ?? "ARC-TESTNET",
} as const;

/** Format a 6-decimal USDC amount for humans. */
export function formatUsdc(amount: bigint | number | string): string {
  const v = typeof amount === "bigint" ? amount : BigInt(amount);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `$${whole.toLocaleString()}.${frac}`;
}

/** Parse a human USDC amount into 6-decimal base units. */
export function parseUsdc(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}
