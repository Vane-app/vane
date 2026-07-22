## What this changes

<!-- One or two sentences. What is different after this merges? -->

## Why

<!-- The problem or the goal. Link an issue if there is one. -->

## Checks

- [ ] `npm run compile -w @vane/contracts`
- [ ] `npm run typecheck -w @vane/agent`
- [ ] `npm run demo -w @vane/agent`
- [ ] No secrets, keys or `.env` contents in the diff

## Trust model

- [ ] This change does not let the agent custody user funds
- [ ] This change does not introduce an arbitrary-recipient payout path
- [ ] Payout and budget caps are still enforced in the contract
- [ ] Settlement is still idempotent

<!-- If you ticked none of these because the change is UI-only, say so here. -->

## Screenshots

<!-- For anything the user sees. Before and after if you changed something existing. -->
