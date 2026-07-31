import "./env.js";

/**
 * The Circle SDKs ship both an ESM and a CJS build, and tsx resolves the CJS one.
 * A static `import { x } from` then fails at load with "does not provide an export
 * named x". Dynamic import goes through Node's CJS interop and works under both tsx
 * and plain node, so every Circle import in this repo is done this way.
 */
const { generateEntitySecret, generateEntitySecretCiphertext, registerEntitySecretCiphertext } = await import(
  "@circle-fin/developer-controlled-wallets"
);

/**
 * Circle entity-secret setup — step one of everything.
 *
 *   npm run entity-secret -w @vane/contracts              # generate a new secret
 *   npm run entity-secret -w @vane/contracts -- ciphertext # print ciphertext for the console
 *   npm run entity-secret -w @vane/contracts -- register   # register via API instead
 *
 * Circle requires a 32-byte entity secret whose *ciphertext* is registered against
 * your account before any wallet call will succeed. Getting this wrong is the most
 * common reason a Circle integration fails on day one, so it is scripted rather than
 * done by hand.
 *
 * The recovery file that registration returns is the only way back into your wallets
 * if the secret is lost. It is written to disk and must not be committed.
 */

const mode = process.argv[2] ?? "generate";

async function main() {
  if (mode === "generate") {
    console.log("\nGenerating a 32-byte entity secret…\n");
    // Prints the secret. Copy it into .env as ENTITY_SECRET, then run `register`.
    generateEntitySecret();
    console.log(
      "\nCopy the hex string above into .env as ENTITY_SECRET, then run:\n" +
        "  npm run entity-secret -w @vane/contracts -- register\n",
    );
    return;
  }

  if (mode !== "register" && mode !== "ciphertext") {
    console.error(`Unknown mode "${mode}". Use "generate", "ciphertext" or "register".`);
    process.exit(1);
  }

  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    console.error(
      "\nCIRCLE_API_KEY and ENTITY_SECRET must both be set in .env.\n" +
        "Get the API key at https://console.circle.com, then run this script in generate mode.\n",
    );
    process.exit(1);
  }

  if (mode === "ciphertext") {
    // For registering by hand in the console: Configurator → Entity Secret.
    // The ciphertext is RSA-OAEP with random padding, so it differs every run — that is
    // expected, and any freshly generated one is valid. It is not a second secret; it is
    // the same secret encrypted to Circle's public key.
    const ciphertext = await generateEntitySecretCiphertext({ apiKey, entitySecret });
    console.log("\nPaste this into the Entity Secret Ciphertext field, then press Register:\n");
    console.log(ciphertext);
    console.log(
      "\nAfterwards Circle offers a recovery file — download it and keep it outside the repo.\n" +
        "It is the only way back into these wallets if the secret is lost.\n" +
        "\nThen: npm run bootstrap -w @vane/contracts\n",
    );
    return;
  }

  console.log("Registering the entity secret ciphertext with Circle…");
  const res = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    // Written next to the repo root, never committed. This is the only recovery path.
    recoveryFileDownloadPath: process.cwd(),
  });

  console.log("\nRegistered.");
  console.log(`Recovery file written to ${process.cwd()} — back it up, do not commit it.`);
  if (res?.data?.recoveryFile) console.log("A recovery file payload was returned by Circle.");
  console.log("\nNext: npm run bootstrap -w @vane/contracts\n");
}

main().catch((err) => {
  console.error("\nRegistration failed.\n");
  console.error(err?.response?.data ?? err);
  console.error(
    "\nIf this says the secret is already registered, you are fine — skip to bootstrap.\n" +
      "If it says the API key is invalid, check you copied the whole PREFIX:ID:SECRET string.\n",
  );
  process.exit(1);
});
