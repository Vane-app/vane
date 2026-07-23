# Vane — the end-to-end journey

How the product works from first visit to money settled, for both sides. This is
the map. Every screen we build should be a step on one of these two paths, and if
a screen isn't, it shouldn't exist.

The falcon — the autonomous agent — is the character that does the trust work.
It should appear at every moment it acts, not just as a logo.

---

## The tasker (promoter) journey

**1. Discover** — lands on the homepage, sees "get paid in seconds", real
campaigns, the agent deciding live. *Falcon: flies in the hero.*

**2. Sign up — deliberately tiny.** One field: email. A payout wallet is created
silently in the background via Circle Wallets. No seed phrase, no card, nothing
shown as "crypto". Under ten seconds. *Falcon: greets them, confirms the account.*

**3. Browse** — the marketplace. Search, filter by task type / payout / effort /
industry, sort. Finds a campaign that fits their audience.

**4. Open a campaign** — reads what counts as a result, how the agent verifies it
(trustless onchain, or integration), the performance, the business's record.
*Falcon: explains how it verifies this specific campaign.*

**5. Take it** — two taps, agrees to the terms, and walks away with a **referral
link**. Onchain, this seals their referral code in the registry contract.

**6. Promote** — shares the link with their audience. Off-platform.

**7. Someone converts** — a referred person signs up / deposits / trades / mints.
The event reaches Vane: onchain directly for web3, via the business's integration
for web2.

**8. The agent decides** — checks the claim against evidence: attribution, wallet
history, post-conversion activity, velocity, the tasker's record. *Falcon: the
moment it thinks, then either pays or refuses — with a written reason.*

**9. Paid** — USDC lands in about a second. *Falcon: the swoop, the payout moment.*

**10. Grow** — earnings dashboard updates (balance, chart, per-campaign
performance, ledger). Reputation rises, which earns faster payouts next time.
Cash out anytime, no minimum.

---

## The business (project) journey

**1. Discover** — same homepage, but they came to *get* users, not earn.

**2. Sign up — more than a tasker.** Business name, category, whether they're a
web business or onchain. A funding wallet is created (Circle Wallets), and they
add USDC to it (faucet on testnet). Optionally stake a **bond** to earn the
Bonded badge. *Falcon: adapts its language — plain fintech for web2, technical
for web3.*

**3. Post a campaign** — pick the task type (referral / content / onchain /
bounty), define the result that pays, set rate and budget and duration. See the
escrow terms and the fee before committing.

**4. Fund the escrow** — the budget locks into the VaneEscrow contract. It is now
visible on their card in the marketplace. Neither they nor Vane can move it.
*Falcon: confirms the vault is sealed.*

**5. Promoters take it** — the campaign appears in browse; taskers take it and get
their links. The business watches the promoter count climb.

**6. Results arrive** — conversions come in. For each, **the agent decides** and
either releases a payout from escrow or refuses it. *Falcon: every decision, with
its reason, on the dashboard.*

**7. Watch the dashboard** — live: budget remaining, verified results, amount
paid, and crucially the ones the agent **refused** (the strongest trust signal an
advertiser gets). The agent's decision log is auditable.

**8. Manage** — top up budget, pause, or cancel. On cancel, earned payouts are
honored and the rest returns.

**9. Campaign ends** — unspent budget returns automatically. The bond is released
on a clean record. Their public profile gains another settled campaign, raising
their reputation for the next one.

---

## Where each dashboard earns its place

| Screen | Whose | Why it must exist |
|---|---|---|
| Homepage `/` | Public | Convince a stranger, route them to sign up |
| Browse `/tasks` | Tasker | Find work — the marketplace |
| Campaign detail `/campaign/[id]` | Tasker | Decide and take a campaign, get the link |
| Earnings `/earnings` | Tasker | Balance, performance, payout ledger |
| Account `/account` | Tasker | Reputation, wallet, campaigns joined |
| Post `/post` | Business | Create and fund a campaign |
| Dashboard `/business` | Business | Watch campaigns settle, see refusals |
| Business profile `/business/[slug]` | Public | Trust — a business's settlement record |
| Payout moment `/paid` | Tasker | The celebration the agent's decision earns |
| Sign up `/join/tasker`, `/join/business` | Both | The two different front doors |

---

## What is real vs placeholder today

**Real:** the escrow contract, the referral registry, the agent's fraud engine
(all compile and run), the full front-end journey as clickable screens.

**Placeholder:** every business, balance, click, payout and quote is hardcoded.
There is no real sign-up, no login, no database, no wallet creation, and the
contracts are not deployed or connected to the app.

**The gap to a working product**, in order:
1. Deploy the contracts to Arc testnet.
2. Real sign-up for each role, creating a Circle wallet.
3. A database for users, campaigns, referrals, results.
4. Wire the take-flow and post-flow to the real contracts.
5. The agent, running as a service, settling real conversions.

Everything visual is in place to hang the real plumbing onto.

---

## Two things to strengthen the concept, per this journey

- **Business premium (Bonded)** should be a real tier: stake a larger bond, get
  the badge, rank higher in browse, and unlock faster campaign approval. It is
  currently only a visual badge.
- **The falcon** should return to the moments it acts — greeting at sign-up,
  thinking during verification, the swoop at payout, the refusal — so the agent
  is felt as a character running the marketplace, not just a wordmark.
