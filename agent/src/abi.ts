export const registryAbi = [
  {
    type: "event",
    name: "ConversionRecorded",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "wallet", type: "address", indexed: true },
      { name: "tasker", type: "address", indexed: true },
      { name: "actionIndex", type: "uint256", indexed: false },
      { name: "kind", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WalletSealed",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "wallet", type: "address", indexed: true },
      { name: "tasker", type: "address", indexed: true },
      { name: "code", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "function",
    name: "taskerFor",
    stateMutability: "view",
    inputs: [
      { name: "campaignId", type: "uint256" },
      { name: "wallet", type: "address" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "sealedAt",
    stateMutability: "view",
    inputs: [
      { name: "campaignId", type: "uint256" },
      { name: "wallet", type: "address" },
    ],
    outputs: [{ type: "uint64" }],
  },
] as const;

export const escrowAbi = [
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "campaignId", type: "uint256" },
      { name: "wallet", type: "address" },
      { name: "actionIndex", type: "uint256" },
      { name: "reason", type: "string" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "hold",
    stateMutability: "nonpayable",
    inputs: [
      { name: "campaignId", type: "uint256" },
      { name: "wallet", type: "address" },
      { name: "actionIndex", type: "uint256" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settleBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "campaignId", type: "uint256" },
      { name: "wallets", type: "address[]" },
      { name: "actionIndexes", type: "uint256[]" },
      { name: "reason", type: "string" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "remaining",
    stateMutability: "view",
    inputs: [{ name: "campaignId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Settled",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "tasker", type: "address", indexed: true },
      { name: "wallet", type: "address", indexed: true },
      { name: "actionIndex", type: "uint256", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Held",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "wallet", type: "address", indexed: true },
      { name: "actionIndex", type: "uint256", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
] as const;
