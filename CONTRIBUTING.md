# Contributing to Vane

## Getting set up

```bash
git clone https://github.com/<org>/vane.git
cd vane
npm install
npm run demo          # the decision engine, no keys required
```

To work against Arc you need Circle credentials:

1. Create an API key at [console.circle.com](https://console.circle.com).
2. Generate a 32-byte entity secret and register its ciphertext with Circle. Nothing will work until this is registered.
3. `cp .env.example .env` and fill it in.
4. Fund a wallet at [faucet.circle.com](https://faucet.circle.com), selecting Arc Testnet.

## Layout

| Path | What lives here |
|---|---|
| `contracts/` | Solidity. The vault and the referral registry. |
| `agent/` | The falcon — verification, decisions, settlement. |
| `app/` | Next.js front end. |

## Before you open a pull request

```bash
npm run compile -w @vane/contracts
npm run typecheck -w @vane/agent
npm run demo -w @vane/agent
```

CI runs all three plus the app build. A red build does not get merged.

## Conventions

- Branch from `main`: `feat/campaign-detail`, `fix/duplicate-settlement`.
- Commit messages say what changed and why, in the imperative: `Cap batch settlement at the funded budget`.
- Money is always in the 6-decimal USDC ERC-20 view. The 18-decimal native view is for gas only. Never add the two.
- Every new rule in the decision engine returns one sentence a business would understand. If it cannot explain itself, it does not ship.
- No secrets in the repo, ever. `.env` is gitignored; keep it that way.

## Rules that are not negotiable

These are load-bearing for the product's trust model. A change here needs review from at least one other team member:

- The agent never custodies user funds.
- `settle()` derives the payee from the on-chain referral seal. There is never an arbitrary-recipient path.
- Payout caps and budget caps are enforced in the contract, not in agent code.
- Expiry refunds stay permissionless.
- Settlement stays idempotent, on-chain and at the Circle API.
