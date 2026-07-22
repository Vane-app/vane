# Vane

**An autonomous marketing marketplace on Arc.** Businesses lock a USDC campaign budget in escrow and say what result they will pay for. Taskers pick campaigns from an open feed and promote them. An autonomous agent — the falcon — verifies every claimed result against on-chain evidence, settles honest work in about a second, refuses fraud with a written reason, and returns unspent budget automatically.

Built for the Programmable Money Hackathon. Entered in **Agentic Economy** (primary) and **DeFi**.

---

## Why this needs programmable money

Performance marketing is settled on invoices and trust. Affiliate networks take 20–30%, pay on Net-60 terms, and enforce $50 payout minimums. Businesses pay before they can verify; earners get paid last and can be re-counted or clawed back with no recourse. The entire fee stack exists to referee two parties who cannot trust each other.

Escrowed USDC on a chain with sub-second settlement and USDC-denominated gas makes that referee software:

- **Budgets are locked before work starts**, so a tasker is never promoting on a promise.
- **Payouts are per-result and immediate**, so sub-cent revenue-share is economically possible — a tasker earns every time a referred user trades, not once a month.
- **Unspent budget returns automatically**, permissionlessly, even if Vane disappears.
- **Nobody signs up for a wallet.** Circle Wallets creates accounts invisibly; Arc denominates gas in USDC. A non-crypto business completes the whole flow without meeting a crypto concept.

## The loop

```
business funds a campaign  →  tasker claims a referral code  →  referred user converts on-chain
        ↓                                                                    ↓
   USDC locked in escrow                                        registry seals attribution
        ↓                                                                    ↓
        └──────────────  falcon reads the evidence and decides  ←────────────┘
                                        ↓
                    settle in ~1s          or          hold, with a reason
```

## Repository

| Path | What it is |
|---|---|
| `contracts/src/VaneEscrow.sol` | Campaign vault. Funds, settles, expires, refunds. Enforces every spending limit. |
| `contracts/src/ReferralRegistry.sol` | On-chain attribution. One-shot, permanent referral seals. |
| `agent/src/decision.ts` | The falcon's judgement — the fraud engine. |
| `agent/src/index.ts` | Watches Arc, judges conversions, settles or holds. |
| `agent/src/signals.ts` | Reads on-chain evidence from Arc. |
| `agent/src/circle/` | Circle Wallets, Smart Contract Platform, agent-to-agent payments. |
| `agent/src/demo.ts` | The decision engine, runnable offline in 5 seconds. |
| `app/` | Next.js front end — business and tasker experiences. |

## Run it

The decision engine runs with no keys, no chain and no network:

```bash
npm install
npm run demo
```

You will see four scenarios judged: a real referral paid, a sybil farm refused with seven reasons, a brand-new tasker correctly *not* punished for being new, and a wallet cluster flagged by pattern.

Compile and deploy the contracts to Arc:

```bash
cp .env.example .env         # fill in Circle credentials
npm run compile -w @vane/contracts
npm run deploy  -w @vane/contracts
```

Run the live agent:

```bash
npm run agent
```

## Circle and Arc stack

| Product | How Vane uses it |
|---|---|
| **Arc** | All contracts and settlement. Chain `5042002`, USDC-denominated gas, sub-second finality. |
| **USDC** | Campaign budgets, payouts, fees. Held in the 6-decimal ERC-20 view throughout. |
| **Circle Wallets** (developer-controlled) | Invisible wallet creation at signup. SCA accounts, so Paymaster can sponsor gas. No seed phrases, ever. |
| **Circle Smart Contract Platform** | Deploys and reads the vault and registry. No private key on disk. |
| **Circle Paymaster** | Gas sponsorship, so a first-time business can fund a campaign holding nothing but USDC. |
| **Nanopayments** | `settleBatch` amortises streaming revenue-share payouts — sub-cent settlements that are uneconomic on any traditional rail. |
| **Circle agent payments** | The falcon pays for its own verification data in USDC, autonomously. A machine-to-machine economy inside the human marketplace. |
| **CCTP** | Arc domain `26`. Cross-chain campaign funding — designed for, deliberately not in the MVP. |

## Trust model

The agent is powerful enough to be useful and too weak to be dangerous. This is enforced in the contract, not in the agent's code.

- **The vault holds the money.** The agent never custodies user funds.
- **The agent cannot choose a payee.** `settle()` derives the recipient from the referral seal recorded *before* the conversion. There is no arbitrary-recipient path, so a stolen agent key cannot drain a budget — the worst case is paying a genuinely attributed tasker early.
- **Amounts are capped in the contract.** Per-payout by `rewardPerAction`, total by the funded budget.
- **Refunds are permissionless.** After `endsAt`, anyone can return unspent budget to the business. The business's money comes home even if Vane is gone.
- **Settlement is idempotent.** Keyed on `(campaign, wallet, actionIndex)` on-chain and by a deterministic idempotency key at the Circle API. A retry can never double-pay.
- **Refusals are on-chain.** `hold()` emits the agent's written reason so businesses audit the agent rather than trusting it.

## Verification — what is and is not trustless

Being precise about this matters more than claiming more than we can prove.

- **Tier 1 — on-chain conversions.** A referred wallet performs an action on the business's contract. Attribution is sealed on-chain before the conversion, the event is public, and nothing is self-reported. **Genuinely trustless.** This is the MVP.
- **Tier 2 — API-verified conversions.** A Web2 business reports conversions through an integration. The report is the business's own claim, so this is *protected*, not trustless: bonded deposits, agent anomaly detection, and portable reputation constrain it. We do not describe this as cryptographic proof.
- **Tier 3 — judgement-based work.** Roadmap. Not built, not claimed.

## Fraud engine

`agent/src/decision.ts` scores every claim against on-chain signals before money moves:

- time between referral seal and conversion — scripted flows convert faster than humans
- wallet history and age at conversion time
- activity *after* converting — real users keep using the product; sybils go silent
- per-tasker velocity
- funding concentration across a tasker's referred wallets
- the tasker's own settled/held record
- cluster detection across a batch — the pattern is evidence no single wallet reveals

Deterministic checks decide the overwhelming majority of cases, which keeps cost and latency flat as volume grows. Every rule returns one sentence a business would understand; a rule that cannot explain itself does not ship.

## Business model

**8% of settled results. The only fee Vane takes.** No listing fees, no subscriptions, no payout fees, no spread.

- Taskers keep 100% of the posted rate. The number on the card is the number that lands.
- The fee is charged to the business, on settled results only, and is enforced in the contract with a hard 10% ceiling.
- Vane earns only when a business receives a verified result and a tasker gets paid.

## Status

- [x] Escrow vault and referral registry, compiling
- [x] Fraud decision engine with written reasoning
- [x] Circle Wallets, Smart Contract Platform and agent-payment integrations
- [x] Offline demo of the decision engine
- [ ] Contracts deployed to Arc testnet
- [ ] Front end wired to live contracts
- [ ] End-to-end settlement on Arc

## Network

| | |
|---|---|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| USDC | `0x3600000000000000000000000000000000000000` (6 dp ERC-20 view) |
| Faucet | `https://faucet.circle.com` |
