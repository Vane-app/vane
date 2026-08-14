import solc from "solc";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, createPublicClient, http, parseAbi, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

/**
 * Local proof that referral codes cannot be hijacked.
 *
 *   anvil &                                  # any local EVM on :8545
 *   npm run test -w @vane/contracts
 *
 * Nothing here touches Arc, spends real USDC or needs a Circle key. It deploys both
 * shapes of the registry to a throwaway chain and runs the attack against each, so the
 * difference between them is demonstrated rather than asserted in a comment.
 *
 * The bug being tested for: code ownership lived in a global `code => tasker` map while
 * uniqueness was only ever enforced per campaign. A referral code is public — it is in
 * the link the promoter shares — so anyone could re-claim a live code under a *different*
 * campaign id, which passed the per-campaign check and overwrote the global owner. Every
 * wallet sealed through the victim's link afterwards resolved to the thief. Wallets
 * already sealed were unaffected, because attribution stores the resolved address at seal
 * time; what was stolen was all future earnings on that link.
 */

const RPC = process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545";

// Anvil's deterministic accounts. Throwaway keys, published in Foundry's own docs.
const KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  alice: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  thief: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  agent: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
} as const;

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");

/**
 * The registry as it was before the fix, reduced to the parts the attack touches.
 *
 * Embedded rather than read out of git history so the test keeps meaning after the fix
 * is committed — it has to be able to show the old behaviour forever.
 */
const LEGACY = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract LegacyReferralRegistry {
    struct Attribution { address tasker; uint64 sealedAt; }
    mapping(bytes32 => address) public taskerOfCode;                       // global
    mapping(uint256 => mapping(bytes32 => bool)) public codeTaken;         // per campaign
    mapping(uint256 => mapping(address => Attribution)) public attributionOf;

    error CodeAlreadyTaken();
    error UnknownCode();
    error AlreadySealed();

    function claimCode(uint256 campaignId, bytes32 code) external {
        if (codeTaken[campaignId][code]) revert CodeAlreadyTaken();
        codeTaken[campaignId][code] = true;
        taskerOfCode[code] = msg.sender;
    }

    function sealReferral(uint256 campaignId, address wallet, bytes32 code) external {
        if (attributionOf[campaignId][wallet].tasker != address(0)) revert AlreadySealed();
        address tasker = taskerOfCode[code];
        if (tasker == address(0)) revert UnknownCode();
        attributionOf[campaignId][wallet] = Attribution({tasker: tasker, sealedAt: uint64(block.timestamp)});
    }

    function taskerFor(uint256 campaignId, address wallet) external view returns (address) {
        return attributionOf[campaignId][wallet].tasker;
    }
}
`;

/** A stand-in for USDC on Arc: 6 decimals, mintable, nothing else. */
const MOCK_USDC = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
`;

interface Artifact {
  abi: readonly unknown[];
  bytecode: `0x${string}`;
}

function compile(sources: Record<string, string>): Record<string, Artifact> {
  const input = {
    language: "Solidity",
    sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, { content: v }])),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  if (errors.length) {
    for (const e of errors) console.error(e.formattedMessage);
    throw new Error("compilation failed");
  }

  const out: Record<string, Artifact> = {};
  for (const contracts of Object.values(output.contracts as Record<string, Record<string, never>>)) {
    for (const [name, artifact] of Object.entries(contracts)) {
      const a = artifact as { abi: readonly unknown[]; evm: { bytecode: { object: string } } };
      out[name] = { abi: a.abi, bytecode: `0x${a.evm.bytecode.object}` };
    }
  }
  return out;
}

const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });

const wallet = (key: `0x${string}`) =>
  createWalletClient({ account: privateKeyToAccount(key), chain: foundry, transport: http(RPC) });

async function deploy(who: `0x${string}`, art: Artifact, args: unknown[] = []) {
  const hash = await wallet(who).deployContract({
    abi: art.abi as never,
    bytecode: art.bytecode,
    args: args as never,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("deploy produced no address");
  return receipt.contractAddress;
}

async function send(who: `0x${string}`, to: `0x${string}`, abi: readonly unknown[], fn: string, args: unknown[]) {
  const hash = await wallet(who).writeContract({
    address: to,
    abi: abi as never,
    functionName: fn as never,
    args: args as never,
  });
  return publicClient.waitForTransactionReceipt({ hash });
}

/** Runs a call expected to revert. Returns true when it did. */
async function reverts(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

let failures = 0;

function check(name: string, passed: boolean, detail: string) {
  console.log(`  ${passed ? "\x1b[32mok  \x1b[0m" : "\x1b[31mFAIL\x1b[0m"}  ${name}`);
  console.log(`        \x1b[2m${detail}\x1b[0m`);
  if (!passed) failures++;
}

async function main() {
  console.log("\n\x1b[1mReferral code ownership — local chain\x1b[0m");
  console.log(`\x1b[2m${RPC}\x1b[0m\n`);

  const CODE = "0x" + "a1".repeat(32);
  const VICTIM_WALLET = getAddress("0x000000000000000000000000000000000000dEaD");
  const alice = privateKeyToAccount(KEYS.alice).address;
  const thief = privateKeyToAccount(KEYS.thief).address;

  const registryAbi = parseAbi([
    "function claimCode(uint256 campaignId, bytes32 code)",
    "function sealReferral(uint256 campaignId, address wallet, bytes32 code)",
    "function taskerFor(uint256 campaignId, address wallet) view returns (address)",
  ]);

  // ---------------------------------------------------------------- the old shape
  console.log("\x1b[1mBefore the fix\x1b[0m");
  const legacy = compile({ "Legacy.sol": LEGACY });
  const legacyAddr = await deploy(KEYS.deployer, legacy.LegacyReferralRegistry);

  await send(KEYS.alice, legacyAddr, registryAbi, "claimCode", [1n, CODE]);
  // The thief claims the *same* code under a different campaign. Passes the per-campaign
  // check, and silently takes ownership of the code everywhere.
  await send(KEYS.thief, legacyAddr, registryAbi, "claimCode", [2n, CODE]);
  await send(KEYS.deployer, legacyAddr, registryAbi, "sealReferral", [1n, VICTIM_WALLET, CODE]);

  const stolenBy = (await publicClient.readContract({
    address: legacyAddr,
    abi: registryAbi,
    functionName: "taskerFor",
    args: [1n, VICTIM_WALLET],
  })) as string;

  check(
    "the old registry could be hijacked",
    getAddress(stolenBy) === getAddress(thief),
    `a wallet sealed through Alice's link on campaign 1 resolved to the thief (${stolenBy.slice(0, 10)}…)`,
  );

  // ---------------------------------------------------------------- the fixed shape
  console.log("\n\x1b[1mAfter the fix\x1b[0m");
  const srcFiles: Record<string, string> = {};
  for (const f of ["ReferralRegistry.sol", "VaneEscrow.sol"]) {
    srcFiles[f] = readFileSync(join(srcDir, f), "utf8");
  }
  srcFiles["MockUSDC.sol"] = MOCK_USDC;
  const fixed = compile(srcFiles);

  const registry = await deploy(KEYS.deployer, fixed.ReferralRegistry);

  await send(KEYS.alice, registry, registryAbi, "claimCode", [1n, CODE]);
  await send(KEYS.thief, registry, registryAbi, "claimCode", [2n, CODE]);
  await send(KEYS.deployer, registry, registryAbi, "sealReferral", [1n, VICTIM_WALLET, CODE]);

  const heldBy = (await publicClient.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "taskerFor",
    args: [1n, VICTIM_WALLET],
  })) as string;

  check(
    "the same attack now changes nothing",
    getAddress(heldBy) === getAddress(alice),
    "the seal still resolves to Alice, who owns the code on campaign 1",
  );

  check(
    "a code held by someone else is refused",
    await reverts(() => send(KEYS.thief, registry, registryAbi, "claimCode", [1n, CODE])),
    "the thief cannot take Alice's code on the campaign it belongs to",
  );

  check(
    "re-claiming your own code is not an error",
    !(await reverts(() => send(KEYS.alice, registry, registryAbi, "claimCode", [1n, CODE]))),
    "a dismissed or failed signing challenge leaves the tasker able to retry",
  );

  // ------------------------------------------------------- the loop still settles
  console.log("\n\x1b[1mThe loop still pays\x1b[0m");

  const usdc = await deploy(KEYS.deployer, fixed.MockUSDC);
  const agent = privateKeyToAccount(KEYS.agent).address;
  const business = privateKeyToAccount(KEYS.deployer).address;

  const escrow = await deploy(KEYS.deployer, fixed.VaneEscrow, [usdc, registry, agent, business, business]);

  const usdcAbi = parseAbi([
    "function mint(address to, uint256 amount)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ]);
  const escrowAbi = parseAbi([
    "function createCampaign(uint128 budget, uint96 rewardPerAction, uint64 durationSeconds, uint64 bond) returns (uint256)",
    "function settle(uint256 campaignId, address wallet, uint256 actionIndex, string reason) returns (uint256)",
  ]);
  const registryFull = parseAbi([
    "function claimCode(uint256 campaignId, bytes32 code)",
    "function sealReferral(uint256 campaignId, address wallet, bytes32 code)",
    "function setReporter(uint256 campaignId, address reporter, bool allowed)",
    "function recordConversion(uint256 campaignId, address wallet, uint256 actionIndex, bytes32 kind)",
  ]);

  const BUDGET = 10_000_000n; // $10
  const REWARD = 500_000n; // $0.50
  await send(KEYS.deployer, usdc, usdcAbi, "mint", [business, BUDGET]);
  await send(KEYS.deployer, usdc, usdcAbi, "approve", [escrow, BUDGET]);
  await send(KEYS.deployer, escrow, escrowAbi, "createCampaign", [BUDGET, REWARD, 86_400n, 0n]);

  // Campaign 1 on this escrow. Alice already owns the code there from the checks above.
  const CONVERTER = getAddress("0x00000000000000000000000000000000000000B0");
  await send(KEYS.deployer, registry, registryFull, "sealReferral", [1n, CONVERTER, CODE]);
  await send(KEYS.deployer, registry, registryFull, "setReporter", [1n, business, true]);
  await send(KEYS.deployer, registry, registryFull, "recordConversion", [
    1n,
    CONVERTER,
    0n,
    "0x" + "00".repeat(32),
  ]);
  await send(KEYS.agent, escrow, escrowAbi, "settle", [1n, CONVERTER, 0n, "Verified — local test."]);

  const paid = (await publicClient.readContract({
    address: usdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [alice],
  })) as bigint;

  check(
    "a verified result pays the sealed tasker",
    paid === REWARD,
    `Alice received ${Number(paid) / 1e6} USDC — the full posted rate, from the escrow`,
  );

  const thiefPaid = (await publicClient.readContract({
    address: usdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [thief],
  })) as bigint;

  check(
    "the thief received nothing",
    thiefPaid === 0n,
    "settlement derives the payee from the seal, which the attack never reached",
  );

  console.log(
    `\n  ${failures === 0 ? "\x1b[32m" : "\x1b[31m"}${6 - failures}/6 passed\x1b[0m\n`,
  );
  if (failures) process.exit(1);
}

if (!existsSync(join(srcDir, "ReferralRegistry.sol"))) {
  console.error("Run this from the repo — contracts/src is missing.");
  process.exit(1);
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}`);
  console.error("\nIs a local chain running?  anvil &");
  process.exit(1);
});
