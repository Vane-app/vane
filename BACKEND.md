# Vane backend — everything needed, end to end

The plan to turn the working front end into a live product on Arc. Ordered so
each piece unlocks the next. Anything only you can provide (accounts, secrets)
is called out explicitly.

---

## 0. Accounts & secrets you must obtain

The code is built to run the moment these exist. Until then, the app runs on a
seeded in-memory fallback so it always demos.

| What | Where | Env var |
|---|---|---|
| Circle API key | console.circle.com | `CIRCLE_API_KEY` |
| Circle entity secret (registered) | console.circle.com | `ENTITY_SECRET` |
| Arc testnet USDC | faucet.circle.com (Arc Testnet) | — funds the deployer + businesses |
| Postgres database | Vercel Marketplace → Neon | `DATABASE_URL` |
| Session secret | generate 32 random bytes | `SESSION_SECRET` |
| App URL | Vercel deployment | `NEXT_PUBLIC_APP_URL` |

Filled in by the deploy step: `VANE_ESCROW_ADDRESS`, `VANE_REGISTRY_ADDRESS`,
`CIRCLE_WALLET_SET_ID`, `CIRCLE_AGENT_WALLET_ID`.

---

## 1. Data layer

Postgres via Drizzle ORM, with a repository layer that falls back to seeded
in-memory data when `DATABASE_URL` is absent — so the front end never breaks.

Tables:

```
users        id, email, role, name, avatar_url, wallet_id, wallet_address,
             reputation, created_at
businesses   id, user_id, name, slug, logo_url, industry, kind(web2|web3),
             bond, bonded, verified, created_at
campaigns    id, business_id, task_type, industry, title, what_counts,
             reward_per_action, budget, spent, effort, ends_at, status,
             escrow_campaign_id, banner_url, created_at
rules        id, campaign_id, text, kind(required|forbidden)
takes        id, campaign_id, user_id, ref_code, sealed_tx, taken_at
clicks       id, take_id, ip_hash, ua_hash, at
conversions  id, take_id, external_id, action_index, kind, at, evidence
decisions    id, conversion_id, verdict, risk, reason, tx_hash, decided_at
payouts      id, decision_id, amount, fee, tx_hash, state, at
profiles     user_id, strengths[], channels[], socials[]   (tasker prefs)
```

---

## 2. Auth

Email-based, no password — the Circle wallet is the identity. Signup/login sends
a code (or, for the demo, accepts the email directly), creates the user, and sets
a signed httpOnly session cookie. On first signup a Circle wallet is created and
its id + address stored.

- `POST /api/auth/start` — email in, code out (logged in dev)
- `POST /api/auth/verify` — code in, session cookie out, user created
- `GET  /api/me` — current user + balance
- `POST /api/auth/logout`

---

## 3. Circle integration (server)

Reuse the wrappers already written in `agent/src/circle`. Move the shared ones
into `app/lib/circle` so the API routes can:

- create a developer-controlled wallet per user (SCA, for Paymaster gas)
- read a wallet's USDC balance
- execute contract calls (fund escrow, claim code, settle, hold)
- poll a transaction to a terminal state

---

## 4. Deploy the contracts to Arc

Two paths, both scripted:
- **Circle Smart Contract Platform** — `contracts/scripts/deploy.ts` (exists).
- **Raw viem + a funded key** — `contracts/scripts/deploy-viem.ts` (add), for
  when deploying without SCP.

Output addresses → `.env`. Verify on `testnet.arcscan.app`.

---

## 5. API routes (the app's spine)

| Route | Does |
|---|---|
| `GET  /api/campaigns` | list, with filters/sort |
| `GET  /api/campaigns/[id]` | detail |
| `POST /api/campaigns` | business creates a campaign → funds escrow onchain |
| `POST /api/campaigns/[id]/take` | tasker takes it → claims a ref code, seals onchain, returns link |
| `GET  /api/r/[code]` | referral link — record click, set cookie, redirect to the business |
| `POST /api/conversion` | conversion intake: signed webhook (web2) or called by the chain listener (web3) |
| `GET  /api/earnings` | tasker balance, streams, ledger |
| `GET  /api/business/[slug]` | public business profile |
| `POST /api/upload` | image upload → Vercel Blob, returns URL |

---

## 6. The agent service

`agent/src/index.ts` (exists) wired to the deployed contracts and the database:
watches `ConversionRecorded`, scores each with the decision engine, writes a
`decisions` row, and calls `settle` or `hold` onchain. Runs as a Vercel Cron or a
long-lived worker. Emits the written reason onchain.

---

## 7. Wire the front end to the API

Replace the hardcoded arrays in `app/lib/data.ts` with fetches to the API. Keep
the same shapes (they already mirror the contract structs), so screens don't
change — only the data source does. The mock fallback stays for offline/demo.

---

## 8. Referral & conversion flow (the heart)

1. Tasker takes a campaign → `takes` row + `claimCode` onchain, gets `/r/{code}`.
2. Someone clicks `/r/{code}` → `clicks` row, cookie set, redirect to business.
3. That person converts:
   - **web3**: they do the onchain action; a listener catches it and calls
     `/api/conversion` with the tx as evidence.
   - **web2**: the business's integration posts a signed webhook to
     `/api/conversion`.
4. The agent decides → `decisions` row → `settle`/`hold` onchain → `payouts` row.
5. Tasker's earnings update; reputation adjusts.

---

## 9. Deploy

- App → Vercel (`vercel --prod`).
- Database → Neon (Vercel Marketplace).
- Env vars → `vercel env`.
- Agent → Vercel Cron hitting an internal settle endpoint, or a small worker.

---

## Build order (this session)

1. Data layer: schema + repository + mock fallback.
2. Auth + session.
3. Circle wallet creation on signup.
4. API routes for campaigns, take, earnings, business.
5. Wire the front end to the API.
6. Contract deploy scripts ready.
7. Agent wired to contracts + DB.
8. Deploy checklist.

Everything is built to run with the fallback today and to go live the moment the
secrets in section 0 are set.
