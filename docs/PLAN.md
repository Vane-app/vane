# Vane — plan to a working product

An honest inventory of what exists, what a real marketplace needs, and the order to build it in.

---

## 1. Where things actually stand

**Working and verified**

- `VaneEscrow.sol` — campaign vault. Funds, settles, expires, refunds. Per-payout and total caps enforced onchain. Compiles.
- `ReferralRegistry.sol` — one-shot permanent referral seals, so attribution cannot be rewritten after a conversion. Compiles.
- The agent's decision engine — scores claims on time-to-convert, wallet history, post-conversion activity, velocity, funding concentration and track record. Catches sybil farms with written reasons. Runs offline via `npm run demo`.
- Circle integrations written: Developer-Controlled Wallets, Smart Contract Platform, agent-to-agent payments.

**Not working**

- **Nothing is connected.** The front end and the contracts have never spoken to each other.
- **No accounts.** No signup, no login, no session, no persistence. Refresh loses everything.
- **No database.** Every business, balance, click and payout is hardcoded in `app/lib/data.ts`.
- **Contracts are not deployed.** Written and compiling, never pushed to Arc.
- **Discovery does not exist.** No search, no categories, no filters that match how anyone chooses work.
- **Only one task type.** Referrals. The original concept had several.
- **The desktop layout is broken** — content crammed into a right-hand strip, overlapping text, mobile tab bar showing alongside the desktop rail.

The design language is settled and the settlement engine is real. The middle of the product is missing.

---

## 2. What Vane is

A business posts a task with money locked in escrow. Someone does the task. An autonomous agent verifies the result against evidence and releases payment in about a second — or refuses it with a written reason. Works for web businesses and onchain businesses; the agent verifies both, and is honest about which one is trustless.

---

## 3. The marketplace — the part that is most wrong today

A marketplace is search, structure and matching. What exists is a vertical list of cards, which is a mobile pattern shown on a laptop.

### Desktop browse

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⌕ Search campaigns, businesses, task types            [Post a task] │
├──────────────────────────────────────────────────────────────────────┤
│  All · Referral · Content · Reviews · Onchain actions · Bounties     │
├────────────┬─────────────────────────────────────────────────────────┤
│ FILTERS    │  248 campaigns · sorted by Highest paying      [Sort ▾] │
│            │  ┌───────────┐ ┌───────────┐ ┌───────────┐              │
│ Task type  │  │  card     │ │  card     │ │  card     │              │
│ Payout     │  └───────────┘ └───────────┘ └───────────┘              │
│ Industry   │  ┌───────────┐ ┌───────────┐ ┌───────────┐              │
│ Effort     │  │  card     │ │  card     │ │  card     │              │
│ Verified   │  └───────────┘ └───────────┘ └───────────┘              │
│ Budget     │                                                          │
└────────────┴─────────────────────────────────────────────────────────┘
```

- **Search** is prominent and searches campaigns, businesses and task types.
- **Category tabs** across the top for task type.
- **Filter rail** on the left: task type, payout range, industry, effort, verification type, budget remaining, ending soon.
- **Sort**: highest paying, newest, ending soon, most taken, best approval rate.
- **Grid** of two to four columns depending on width. Never one column on a laptop.
- **Result count and active filter chips** so the user always knows what they are looking at.

### Mobile browse

Search pinned at top, horizontally scrolling category chips, a **Filters** button that opens a sheet, single-column cards. Same data, same code, one breakpoint.

### The card

Business avatar and name · verified/bonded badge · task-type tag · payout as the hero figure · what counts, in one line · funded bar · time left · Take button.

---

## 4. Task types

Referral-only was never the concept. Four types, one settlement engine:

| Type | Example | Verified by |
|---|---|---|
| **Referral** | Bring a signup, deposit, or trade | Onchain seal (web3) or integration (web2) |
| **Content** | Post, review, video mentioning the product | Platform API — the post exists and meets criteria |
| **Onchain action** | Mint, swap, stake, bridge | Read directly from chain — fully trustless |
| **Bounty** | A one-off deliverable | Business approval with staked dispute — last to build |

The card, detail page and agent verification block all adapt to the type. The escrow contract does not change.

---

## 5. Routes

| Route | Purpose |
|---|---|
| `/` | Marketing homepage — done |
| `/browse` | The marketplace: search, filters, grid |
| `/campaign/[id]` | Detail and take-flow — drafted, needs wiring |
| `/business/[slug]` | Business profile: all their campaigns, settlement record |
| `/post` | Business posts a task — the missing half of the marketplace |
| `/dashboard` | Business: campaigns, escrow, agent decisions |
| `/earnings` | Promoter: balance, chart, per-campaign performance, ledger |
| `/signup`, `/login` | Real accounts |
| `/settings` | Payout details, profile |

---

## 6. Data model

```
User          id, email, role, wallet_id, created_at, reputation
Business      id, user_id, name, slug, logo, category, kind(web2|web3), bond, verified
Campaign      id, business_id, type, title, what_counts, rate, budget, spent,
              starts_at, ends_at, status, escrow_address, chain_campaign_id
Rule          campaign_id, text, kind(required|forbidden)
Take          id, campaign_id, user_id, ref_code, taken_at
Click         id, take_id, ip_hash, ua_hash, at
Conversion    id, take_id, external_id, action_index, at, evidence
Decision      id, conversion_id, verdict, risk, reason, tx_hash, decided_at
Payout        id, decision_id, amount, fee, tx_hash, state
```

---

## 7. Backend

- **Next.js route handlers** — no separate service needed.
- **Postgres via Neon** (Vercel Marketplace) with Drizzle or Prisma.
- **Auth**: Clerk, or email magic links. On signup, silently create a Circle wallet and store `wallet_id`.
- **Referral links**: `vane.money/r/{code}` → record click, set cookie, seal onchain on first conversion, redirect to the business.
- **Conversion intake**: `POST /api/conversion` for web2 businesses (signed webhook), chain event listener for web3.
- **Agent**: runs as a worker, consumes conversions, writes decisions, calls `settle` or `hold`.

---

## 8. Contracts and wiring

1. Get Circle API key and entity secret; register the ciphertext.
2. Fund a wallet from `faucet.circle.com` (Arc Testnet).
3. `npm run compile && npm run deploy -w @vane/contracts`.
4. Put the addresses in `.env`.
5. Campaign creation calls `createCampaign`; the take-flow calls `claimCode`; the agent calls `settle`/`hold`.

---

## 9. Build order

**Phase 1 — make one path real (highest value)**
1. Fix the broken desktop layout.
2. Deploy contracts to Arc testnet.
3. Auth + database + signup creating a Circle wallet.
4. Business posts a campaign → real escrow funded onchain.
5. Promoter takes it → real referral code, sealed onchain.
6. A conversion → the agent decides → USDC actually moves.

That is the demo. One campaign, one promoter, real money, real refusal.

**Phase 2 — make it a marketplace**
7. Search, filters, categories, sort.
8. Business profiles.
9. Content task type with one platform API.

**Phase 3 — after the deadline**
10. Onchain-action tasks, bounties, disputes, reputation as an API, cross-chain funding.

---

## 10. What to cut

Cut for now: bounties and disputes, cross-chain, reputation scores beyond a counter, social login, mobile app, anything with an LLM in the verification path.

Keep: the escrow, the referral seal, the agent's decision log including refusals, instant settlement, one responsive build.

---

## 11. The honest risk

The largest remaining risk is not design — it is that no part of the front end has ever called the contracts. Until a single real settlement happens end to end, every estimate here is a guess. Phase 1 step 6 should be attempted before anything in Phase 2 is started.
