# Vane — the route

One decision, written down, so every build choice between now and **August 9** can be
checked against it. This supersedes the framing in `PLAN.md`. Where they disagree, this wins.

---

## 1. What we are not building

A campaign hub. Galxe, Zealy, Layer3 and QuestN already exist, have distribution, and
do the following well enough that we cannot beat them at it:

> a project funds a quest board · users click tasks · a centralised API decides who
> passed · points are distributed later

If a judge can finish the sentence "oh, so it's like ___", we have lost. Every screen
that reads as *browse quests → take one → claim reward* pushes us toward that sentence.

The consumer marketplace UI stays in the product. It stops being the pitch.

---

## 2. What we are building

**A performance marketing marketplace where the network is an agent, the money is
escrowed, and the worker does not have to be human.**

Lead with the concrete category, not the abstraction. A judge needs to know what this
*is* in about five words; "outcome market" tells them nothing they can act on.
Performance marketing names the industry, the buyer and the business model instantly —
and it points at the right enemy.

### Who we are positioned against

Not Galxe. **Affiliate networks** — Impact, PartnerStack, CJ, Awin. A $20B+ industry
whose failures we fix precisely:

| Their failure | Our answer |
|---|---|
| 20–30% network take rate | 2.5%, enforced in the contract, hard-capped at 10% |
| Net-60 payment terms | settles in about a second |
| $50 payout minimums | sub-cent settlement via `settleBatch` |
| Business pays before it can verify | budget escrowed, released only against evidence |
| Earner can be re-counted or clawed back | attribution sealed on-chain before the conversion |
| Trust the network's word on fraud | every refusal published on-chain, in writing |

Framing against affiliate networks is far stronger than framing against a quest
platform: real buyers, real budgets, real hatred of the incumbent.

**"Outcome market" remains the internal thesis** — it is the right lens for deciding
what to build and what to cut (§3). It is not the opening line.

### The submission description

> Vane is a performance marketing marketplace on Arc, where an autonomous agent — the
> falcon — replaces the middleman. Businesses (Web2 and Web3) lock a USDC budget in
> escrow and post the result they will pay for. Anyone can earn it: a person, or an
> autonomous agent.
>
> The falcon verifies every claimed result against on-chain evidence and settles in
> about a second — paying honest work, and refusing fraud with a written reason
> published on-chain. It can judge, but it can never touch the money: the payee is
> fixed by the contract before the work happens. No human approval, no Net-60 wait,
> no 30% network fee.

Structure to preserve everywhere: **concrete category first, differentiation
immediately after.**

Say "autonomous agent", never "AI agent". `decision.ts` is deterministic by design and
that is a strength — cost and latency stay flat as volume grows. Claiming "AI" invites
"which model?", and the honest answer then sounds like a gotcha instead of an
architectural choice.

---

## 3. Why this is not reachable from a quest board

Four properties. Each is structural — a consequence of building on escrow and Arc —
not a feature that could be copied in a sprint.

### 3.1 We verify outcomes, not identities

Every quest platform's core problem is sybil resistance, so their entire stack is
identity: captchas, social linking, wallet scores, *prove you are human*.

`agent/src/decision.ts` never asks who anyone is. It asks whether the outcome is real
and whether attribution was sealed before it happened.

The consequence is the whole thesis: **if the worker never had to be human, it doesn't
have to be.** A quest platform cannot follow us here without discarding its anti-fraud
model, because its anti-fraud model *is* proof-of-humanity.

### 3.2 Therefore: machines are first-class workers

An autonomous agent can claim a code, produce a verified outcome, and be paid per
result in USDC. Combined with the falcon paying for its own verification data, Vane
becomes a market where both sides can be machines and the escrow is the only referee.

This is the Agentic Economy thesis, executed rather than described.

### 3.3 Sub-cent per-result settlement is a different economic object

Galxe pays once, for one action, in points, later. It cannot pay $0.004, and it cannot
pay again next Tuesday when the referred user trades again — the rails forbid it and
ops cost eats it.

`settleBatch` does both. So a Vane campaign is not a bounty. It is **an ongoing claim
on the value a referral keeps producing** — a performance annuity, settled continuously
in fractions of a cent. That object does not exist off a chain like Arc.

### 3.4 The refusal is the product

Nobody publishes what they rejected, because their false-positive rate would be public.

`Held(campaignId, wallet, actionIndex, reason)` puts every refusal on a public chain in
a sentence a business can read. Our answer to "how do I know you aren't paying fraud"
is: *here is everything we refused and why, permanently, go audit us.*

### 3.5 The safety property that makes agent autonomy defensible

`settle()` derives the payee from a referral seal recorded **before** the conversion.
There is no arbitrary-recipient path. A stolen agent key cannot steal — the worst case
is paying a genuinely attributed worker early.

Say it as: **the agent is trusted with judgement, never with custody.**

---

## 4. Verification — one primitive, decided

**A campaign is a contract address plus an event. Any matching event from an attributed
wallet is a payable outcome.**

- Nothing is self-reported. The chain is the oracle.
- Zero integration: a business pastes a contract address and picks an event.
- One code path covers referral, deposit, swap, mint, stake — the "task types" are UI.
- `DemoBusiness.sol` supports both the zero-integration event path and the stronger
  registry-sealed path, so we can show either.

**Cut from the build:** web2 webhook intake (Tier 2). It is self-reported, cannot be
demoed trustlessly, and collapses under one question. One roadmap line, nothing more.

---

## 5. Scope

**Build**

- Deploy escrow + registry + demo business to Arc testnet
- One campaign funded, one code claimed, one conversion, one settlement — real USDC
- Generic event watcher: `(targetContract, eventTopic)`
- **Autonomous tasker agents** — the differentiator. Machines earning from campaigns.
- **Streaming rev-share** via `settleBatch` — sub-cent continuous payouts
- **The refusal demo** — a sybil cluster refused on-chain, in writing
- Live agent ledger: the falcon's own USDC balance moving as it buys verification data

**Cut**

Web2 webhooks · content and bounty task types · business profiles · bonds as a real
tier · verification badges · search and filter depth · reputation beyond a counter ·
onboarding polish · cross-chain

The marketplace UI ships as-is. It is not where the remaining hours go.

---

## 6. The demo — three minutes, everything on arcscan

1. **Business posts an outcome.** "$0.50 per wallet that swaps on my contract, $500
   locked." → escrow funding tx, on the explorer.
2. **Autonomous agents take it.** Three tasker agents claim codes and go to work. No
   human clicks anything.
3. **Outcomes stream in.** The falcon judges each against on-chain evidence. The ledger
   fills. Sub-cent rev-share ticks continuously.
4. **One agent cheats.** Sybil wallets funded from a single source, converting in
   seconds. The falcon **refuses on-chain, with a written reason.** Its reputation drops.
5. **The falcon's own wallet.** It spent USDC on verification data while doing this.
   Machine paying machine.
6. **The campaign ends.** Unspent budget returns automatically, permissionlessly.

Step 4 is the moment that wins it. Everything else is setup for it.

---

## 7. Schedule to August 9

| Days | Work |
|---|---|
| 1–2 | Circle credentials, deploy all three contracts to Arc, verify on arcscan |
| 3–4 | One real end-to-end settlement. Front end calling real contracts. |
| 5–7 | Generic event watcher · autonomous tasker agents · agent ledger |
| 8–9 | Streaming rev-share via `settleBatch` · the refusal path, reproducible on demand |
| 10–11 | Harden the demo. Seed data. Explorer links at every step. |
| 12–13 | Pitch, video, README rewritten around this route |

**Nothing in days 5–13 starts until one real settlement has happened on Arc.** That is
the gate. If the loop does not close, everything above is a slide deck.

---

## 7a. Custody — settled, and not negotiable

**Vane must never be able to move a user's money.** A marketplace whose pitch is
"an agent replaces the middleman" cannot have the middleman holding everyone's balance.
It contradicts the trust model, and in the real world it is a money-transmitter problem
rather than a design preference.

Circle's own framing decides it. Developer-controlled wallets: *"you hold and manage
assets on behalf of users"* — custodial by design. User-controlled wallets: *"a
transaction can only be conducted with explicit authorization from the user."*

| Who | Wallet | Why |
|---|---|---|
| The falcon | **Developer-controlled** | Vane's own operating money. Must act with no human in the loop. Holds no user funds. |
| Campaign budgets | **Neither — `VaneEscrow`** | Locked by code. Not Vane's, and not the business's once funded. |
| Taskers and businesses | **User-controlled** | Their money. Non-custodial, MPC, keyshare never reaches our servers. |

**Verified against Circle's docs (2026-07-28):**
- `ARC-TESTNET` supports user-controlled wallets, both `EOA` and `SCA`, no chain-specific limits
- User-controlled wallets support `EOA`, which Gateway nanopayments requires — no conflict
- Backend `@circle-fin/user-controlled-wallets`; browser `@circle-fin/w3s-pw-web-sdk`
- Auth: 6-digit PIN + security questions, or social login / email OTP

**Why this costs less than it appears.** Receiving a payout needs no key and no signature:
`settle()` sends USDC from the escrow contract straight to the tasker's address. The core
money path — verified result to tasker paid — is unchanged, and Vane never touches it.
Users authorise only three things, all of which they *should* consciously approve:
taking a campaign (`claimCode`), funding one (`approve` + `createCampaign`), and cashing out.

It also fits nanopayments better, not worse. Circle describes it as *"preserving the
non-custodial model where payments can only be executed from user-signed authorizations."*
The business signing its own payment authorisations is the intended design.

**The scripts are a test harness, not the product.** `e2e`, `sybil`, `tasker` and `nano`
drive developer-controlled wallets because they run headless. They exist to prove the
contracts and the decision engine against a live chain. They are not how the product
holds user funds, and the README must not imply otherwise.

## 7b. Circle Nanopayments — where it fits, and where it does not

Circle Nanopayments (powered by Gateway) does gas-free USDC down to $0.000001 using x402
and EIP-3009 authorisations signed offchain, settled in batches. Arc Testnet is supported.
Gateway Wallet on testnet is `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`. There is no
SDK — it is contract calls plus the Gateway REST API.

**Where it fits perfectly: the falcon buying its own verification data.** x402 is built for
exactly this — an agent pays per API call, signs offchain, spends no gas. It makes
`agent/src/circle/services.ts` real, it is a first-party Circle product, and it is the
literal subject of the Agentic Economy track. This is the one to build.

**Where it does not replace `settleBatch`: escrow payouts.** An EIP-3009 authorisation must
be signed by the payer. Vane's payer is `VaneEscrow`, a contract holding funds the business
has already locked — and a contract cannot sign EIP-3009. Routing tasker payouts through
Gateway would mean the business holds a Gateway balance and Vane signs against it, which
gives up the guarantee that the budget is locked before any work starts. That guarantee is
the whole trust model; we do not trade it for cheaper gas.

So: **both, for different jobs.** `settleBatch` settles escrowed outcomes on-chain, where
the contract's custody guarantee matters. Nanopayments handles agent-to-agent spending,
where it does not.

A third, cheap use: **Gateway's unified balance for tasker cash-out** — earn on Arc, spend
on any supported chain, no bridging. UX win, not core.

## 8. Open decisions

- **Fee: 2.5% or 8%?** `README.md` says 8%, `VaneEscrow.sol:40` says 250 bps. Must pick
  one before deploy. Recommendation: 2.5% — "cheaper than card processing, enforced in
  code, hard-capped at 10%" is the stronger claim and matches what is deployed.
