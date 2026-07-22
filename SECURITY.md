# Security

Vane holds campaign budgets in escrow and settles payments autonomously. We take reports seriously.

## Reporting a vulnerability

Do not open a public issue for anything that could put funds at risk. Use GitHub's private vulnerability reporting on this repository (Security → Report a vulnerability), or email the team directly.

Please include what you found, how to reproduce it, and what an attacker could achieve. We will acknowledge within 48 hours.

## Status

This code is hackathon-stage and deployed to Arc **testnet** only. It has not been audited. Do not put real money in it.

## Design guarantees

The following are enforced in the contracts, not in agent code, and are the properties most worth attacking:

- **The agent cannot choose a payee.** `settle()` reads the recipient from the referral seal recorded before the conversion. There is no path that pays an arbitrary address.
- **The agent never custodies user funds.** The vault holds them.
- **Amounts are capped on-chain.** Per payout by `rewardPerAction`, in total by the funded budget.
- **Settlement is idempotent**, keyed on `(campaignId, wallet, actionIndex)`.
- **Refunds are permissionless** after `endsAt`, so a business recovers unspent budget even if Vane is offline.
- **Attribution is one-shot.** A wallet's referral seal is permanent and cannot be rewritten after a conversion.

If you find a way around any of these, that is the report we most want to receive.

## Known limitations

- Tier 2 verification relies on a business reporting its own conversions. This is constrained by bonded deposits, anomaly detection and reputation — it is not cryptographic proof, and we do not describe it as such.
- The fraud engine's thresholds are tuned on synthetic scenarios, not production data.
- Wallet first-seen time is approximated from nonce rather than a full index of inbound transfers.
