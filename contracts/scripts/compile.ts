import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Compiles the Vane contracts with the solc-js compiler, so the repo builds on any
 * machine with Node and no Foundry or Hardhat toolchain installed.
 *
 *   npm run compile -w @vane/contracts
 */

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");
const outDir = join(here, "..", "out");

const sources: Record<string, { content: string }> = {};
for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".sol"))) {
  sources[file] = { content: readFileSync(join(srcDir, file), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

const errors = (output.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const w of output.errors ?? []) {
  if (w.severity === "warning") console.warn(w.formattedMessage);
}

mkdirSync(outDir, { recursive: true });

for (const [file, contracts] of Object.entries(output.contracts as Record<string, Record<string, never>>)) {
  for (const [name, artifact] of Object.entries(contracts)) {
    const a = artifact as { abi: unknown; evm: { bytecode: { object: string } } };
    const out = {
      contractName: name,
      abi: a.abi,
      bytecode: `0x${a.evm.bytecode.object}`,
    };
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(out, null, 2));
    const size = a.evm.bytecode.object.length / 2;
    console.log(`compiled ${name.padEnd(20)} ${String(size).padStart(6)} bytes  (${file})`);
  }
}

console.log(`\nArtifacts written to ${outDir}`);
